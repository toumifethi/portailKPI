import type React from 'react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { clientsApi, jiraConnectionsApi, kpiApi, issuesApi } from '@/api/endpoints';
import type { FormulaNode, FormulaFilters, FormulaAst, FormulaFunction, MetricInfo, CustomFieldFilter, JiraCustomFieldInfo, IssueFieldFilter, JiraConnection } from '@/types';
import { ScopeRuleEditor } from './ScopeRuleEditor';
import { astToSql } from '@/utils/astToSql';
import { highlightSql } from './SqlHighlightEditor';

const FUNCTIONS: { id: FormulaFunction; label: string; arity: number; description: string }[] = [
  { id: 'sum', label: 'Somme', arity: 1, description: 'Somme d\'une métrique' },
  { id: 'avg', label: 'Moyenne', arity: 1, description: 'Moyenne d\'une métrique' },
  { id: 'count', label: 'Comptage', arity: 1, description: 'Nombre d\'éléments' },
  { id: 'ratio', label: 'Ratio (%)', arity: 2, description: 'Ratio A/B en pourcentage' },
  { id: 'subtract', label: 'Soustraction', arity: 2, description: 'A - B' },
  { id: 'add', label: 'Addition', arity: 2, description: 'A + B' },
  { id: 'divide', label: 'Division', arity: 2, description: 'A / B' },
  { id: 'round', label: 'Arrondi', arity: 2, description: 'Arrondi à N décimales' },
];

interface FormulaEditorProps {
  value: FormulaAst | null;
  onChange: (ast: FormulaAst) => void;
  clientId?: number;
  period?: string;
  /** Si true, affiche uniquement l'expression sans onglets */
  section?: 'expression';
}

const DEFAULT_FILTERS: FormulaFilters = {
  scopeRule: { type: 'resolved_in_period' },
  issueTypes: [],
  statuses: [],
};

const DEFAULT_NODE: FormulaNode = { type: 'metric', id: 'consomme' };

export function FormulaEditor({ value, onChange, clientId, period, section }: FormulaEditorProps) {
  const [expression, setExpression] = useState<FormulaNode>(value?.expression ?? DEFAULT_NODE);
  const [filters] = useState<FormulaFilters>(value?.filters ?? DEFAULT_FILTERS);
  const [globalJiraConnectionId, setGlobalJiraConnectionId] = useState<number | undefined>(undefined);

  const { data: jiraConnections } = useQuery({
    queryKey: ['jira-connections'],
    queryFn: () => jiraConnectionsApi.list(),
    enabled: !clientId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (clientId) {
      setGlobalJiraConnectionId(undefined);
      return;
    }

    if (globalJiraConnectionId || !jiraConnections || jiraConnections.length !== 1) {
      return;
    }

    setGlobalJiraConnectionId(jiraConnections[0].id);
  }, [clientId, globalJiraConnectionId, jiraConnections]);

  const { data: metrics } = useQuery({
    queryKey: ['kpi-metrics'],
    queryFn: kpiApi.getMetrics,
    staleTime: 60_000,
  });

  const testMutation = useMutation({
    mutationFn: () => {
      const ast: FormulaAst = { version: 1, expression, filters };
      return kpiApi.testFormula(ast, clientId ?? 0, period ?? getCurrentPeriod());
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => kpiApi.validateFormula({ version: 1, expression, filters }),
  });

  // Propager les changements
  useEffect(() => {
    onChange({ version: 1, expression, filters });
  }, [expression, filters]);

  const [showSqlPreview, setShowSqlPreview] = useState(false);

  const globalJiraContext = !clientId
    ? {
      jiraConnections: jiraConnections ?? [],
      selectedConnectionId: globalJiraConnectionId,
      onConnectionChange: setGlobalJiraConnectionId,
    }
    : undefined;

  // Mode section unique (pour intégration dans un modal à onglets externes)
  if (section) {
    return (
      <div>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <NodeEditor node={expression} onChange={setExpression} metrics={metrics ?? []} depth={0} clientId={clientId} globalJiraContext={globalJiraContext} />
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowSqlPreview(!showSqlPreview)} style={btnSqlPreview}>
            {showSqlPreview ? '▲ Masquer le SQL' : '🔍 Voir le SQL généré'}
          </button>
        </div>
        {showSqlPreview && <SqlPreviewPanel ast={{ version: 1, expression, filters }} />}
      </div>
    );
  }

  // Mode standalone (pour le modal de personnalisation client)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, maxHeight: '60vh', overflowY: 'auto' }}>
        <NodeEditor node={expression} onChange={setExpression} metrics={metrics ?? []} depth={0} clientId={clientId} globalJiraContext={globalJiraContext} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => validateMutation.mutate()} style={btnSecondary}>
          {validateMutation.isPending ? 'Validation...' : 'Valider'}
        </button>
        {clientId && (
          <button onClick={() => testMutation.mutate()} style={btnPrimary} disabled={testMutation.isPending}>
            {testMutation.isPending ? 'Calcul...' : 'Tester sur les donnees'}
          </button>
        )}
        <button onClick={() => setShowSqlPreview(!showSqlPreview)} style={btnSqlPreview}>
          {showSqlPreview ? '▲ Masquer le SQL' : '🔍 Voir le SQL généré'}
        </button>
      </div>

      {showSqlPreview && <SqlPreviewPanel ast={{ version: 1, expression, filters }} />}

      {/* Résultat validation */}
      {validateMutation.data && (
        <div style={{
          padding: 10, borderRadius: 6, fontSize: 13,
          background: validateMutation.data.valid ? '#d1fae5' : '#fee2e2',
          color: validateMutation.data.valid ? '#065f46' : '#b91c1c',
        }}>
          {validateMutation.data.valid
            ? <>Formule valide : <em>{validateMutation.data.description}</em></>
            : <>Erreurs : {validateMutation.data.errors.join(', ')}</>}
        </div>
      )}

      {/* Résultat test */}
      {testMutation.data?.result && (
        <div style={{ padding: 10, borderRadius: 6, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 13 }}>
          <strong>Resultat test :</strong> {testMutation.data.result.value !== null
            ? <span style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>{testMutation.data.result.value}</span>
            : <span style={{ color: '#9ca3af' }}>null</span>}
          <span style={{ marginLeft: 12, color: '#6b7280' }}>
            ({testMutation.data.result.ticketCount} tickets, {testMutation.data.result.excludedTicketCount} exclus)
          </span>
          {testMutation.data.result.debug && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
              {Object.entries(testMutation.data.result.debug).map(([k, v]) => (
                <span key={k} style={{ marginRight: 12 }}>{k}: <strong>{v != null ? Math.round(v * 100) / 100 : 'null'}</strong></span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filtres avec cases à cocher ──

const COMMON_STATUSES = [
  'To Do', 'To be scheduled', 'En cours', 'In Progress',
  'Code Review', 'En test', 'En recette',
  'Done', 'Closed', 'Resolved',
  'Réalisation terminée',
];

function FilterCheckboxes({
  filters,
  onChange,
  clientId,
  globalJiraContext,
  hidePerimetre,
}: {
  filters: FormulaFilters;
  onChange: (f: FormulaFilters) => void;
  clientId?: number;
  globalJiraContext?: {
    jiraConnections: JiraConnection[];
    selectedConnectionId?: number;
    onConnectionChange: (jiraConnectionId: number | undefined) => void;
  };
  hidePerimetre?: boolean;
}) {
  const jiraConnections = globalJiraContext?.jiraConnections ?? [];
  const selectedConnectionId = globalJiraContext?.selectedConnectionId;

  // Charger les clients pour résoudre la connexion JIRA quand une est sélectionnée
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
    enabled: !clientId && !!selectedConnectionId,
    staleTime: 60_000,
  });

  // Trouver un clientId de référence pour charger les champs custom
  const effectiveClientId = clientId ?? clients?.find((c) => c.jiraConnectionId === selectedConnectionId)?.id;

  const { data: issueTypes } = useQuery({
    queryKey: ['issueTypes'],
    queryFn: () => issuesApi.listTypes(),
    staleTime: 60_000,
  });

  const selectedTypes = new Set(filters.issueTypes ?? []);
  const selectedStatuses = new Set(filters.statuses ?? []);

  function toggleType(type: string) {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type); else next.add(type);
    onChange({ ...filters, issueTypes: [...next] });
  }

  function toggleStatus(status: string) {
    const next = new Set(selectedStatuses);
    if (next.has(status)) next.delete(status); else next.add(status);
    onChange({ ...filters, statuses: [...next] });
  }

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Périmètre (scope rule) — masqué si hidePerimetre */}
      {!hidePerimetre && (
        <div>
          <label style={miniLabel}>Perimetre (regle de selection des issues)</label>
          <ScopeRuleEditor
            clientId={clientId}
            globalJiraContext={globalJiraContext}
            value={filters.scopeRule}
            onChange={(rule) => onChange({ ...filters, scopeRule: rule })}
          />
        </div>
      )}

      {/* Sélecteur instance JIRA (mode global) */}
      {!clientId && jiraConnections && jiraConnections.length > 0 && (
        <div style={{ padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
          <label style={{ fontSize: 11, color: '#92400e', display: 'block', marginBottom: 4, fontWeight: 600 }}>
            Instance JIRA de reference (pour les champs custom)
          </label>
          <select
            value={selectedConnectionId ?? ''}
            onChange={(e) => globalJiraContext?.onConnectionChange(e.target.value ? Number(e.target.value) : undefined)}
            style={{ padding: '3px 6px', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, width: '100%', background: 'white' }}
          >
            <option value="">-- Selectionner une instance --</option>
            {jiraConnections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.jiraUrl})</option>
            ))}
          </select>
          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#92400e' }}>
            Les champs custom ci-dessous seront charges depuis cette instance. Si un client utilise une autre instance, personnalisez sa formule.
          </p>
        </div>
      )}

      {/* Types d'issues */}
      <div>
        <label style={miniLabel}>Types d'issues {selectedTypes.size === 0 && <span style={{ color: '#9ca3af' }}>(tous)</span>}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(issueTypes ?? ['Epic', 'Story', 'Bug', 'Task', 'Sub-task']).map((type) => (
            <label key={type} style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4,
              background: selectedTypes.has(type) ? '#dbeafe' : '#f3f4f6',
              color: selectedTypes.has(type) ? '#1d4ed8' : '#374151',
              border: selectedTypes.has(type) ? '1px solid #93c5fd' : '1px solid #e5e7eb',
            }}>
              <input type="checkbox" checked={selectedTypes.has(type)} onChange={() => toggleType(type)}
                style={{ accentColor: '#4f46e5', width: 12, height: 12 }} />
              {type}
            </label>
          ))}
        </div>
      </div>

      {/* Statuts */}
      <div>
        <label style={miniLabel}>Statuts {selectedStatuses.size === 0 && <span style={{ color: '#9ca3af' }}>(tous)</span>}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COMMON_STATUSES.map((status) => (
            <label key={status} style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4,
              background: selectedStatuses.has(status) ? '#d1fae5' : '#f3f4f6',
              color: selectedStatuses.has(status) ? '#065f46' : '#374151',
              border: selectedStatuses.has(status) ? '1px solid #86efac' : '1px solid #e5e7eb',
            }}>
              <input type="checkbox" checked={selectedStatuses.has(status)} onChange={() => toggleStatus(status)}
                style={{ accentColor: '#059669', width: 12, height: 12 }} />
              {status}
            </label>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div>
        <label style={miniLabel}>Labels JIRA (vide = tous)</label>
        <input
          value={(filters.labels ?? []).join(', ')}
          onChange={(e) => onChange({ ...filters, labels: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : [] })}
          placeholder="ex: backend, frontend, urgent"
          style={inputStyle}
        />
      </div>

      {/* Components */}
      <div>
        <label style={miniLabel}>Composants JIRA (vide = tous)</label>
        <input
          value={(filters.components ?? []).join(', ')}
          onChange={(e) => onChange({ ...filters, components: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : [] })}
          placeholder="ex: API, Frontend, Database"
          style={inputStyle}
        />
      </div>

      {/* Exclude tickets */}
      <div>
        <label style={miniLabel}>Exclure des tickets (cles JIRA)</label>
        <input
          value={(filters.excludeJiraKeys ?? []).join(', ')}
          onChange={(e) => onChange({ ...filters, excludeJiraKeys: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : [] })}
          placeholder="ex: ISR-1234, ISR-5678"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
      </div>

      {/* Worklogs par collaborateur évalué */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={filters.filterWorklogsByAuthor ?? false}
            onChange={(e) => onChange({ ...filters, filterWorklogsByAuthor: e.target.checked || undefined })}
            style={{ accentColor: '#4f46e5', width: 12, height: 12 }} />
          Worklogs du collaborateur evalue uniquement
          <span style={{ fontSize: 10, color: '#9ca3af' }}>(filtre par auteur du worklog)</span>
        </label>
      </div>

      {/* Filtres champs custom */}
      <CustomFieldFiltersUI
        filters={filters.customFieldFilters ?? []}
        logic={filters.customFieldLogic ?? 'AND'}
        onChange={(cfFilters, logic) => onChange({ ...filters, customFieldFilters: cfFilters, customFieldLogic: logic })}
        clientId={effectiveClientId}
      />

      {/* Filtres champs natifs issue */}
      <IssueFieldFiltersUI
        filters={filters.issueFieldFilters ?? []}
        onChange={(issueFieldFilters) => onChange({ ...filters, issueFieldFilters })}
      />
    </div>
  );
}

// ── Filtres champs natifs issue ──

const ISSUE_FIELDS: { id: IssueFieldFilter['field']; label: string }[] = [
  { id: 'originalEstimateHours', label: 'Estimation initiale (h)' },
  { id: 'storyPoints', label: 'Story points' },
  { id: 'timeSpentSeconds', label: 'Temps consomme (s)' },
  { id: 'remainingEstimateSeconds', label: 'Restant (s)' },
  { id: 'rollupTimeSpentHours', label: 'Consomme rollup (h)' },
  { id: 'rollupEstimateHours', label: 'Estime rollup (h)' },
  { id: 'rollupRemainingHours', label: 'Restant rollup (h)' },
];

const ISSUE_FIELD_OPERATORS: { id: IssueFieldFilter['operator']; label: string; needsValue: boolean }[] = [
  { id: 'is_null', label: 'est vide (null)', needsValue: false },
  { id: 'is_not_null', label: "n'est pas vide", needsValue: false },
  { id: 'is_zero', label: '= 0', needsValue: false },
  { id: 'is_null_or_zero', label: 'est vide ou 0', needsValue: false },
  { id: 'gt_zero', label: '> 0', needsValue: false },
  { id: 'equals', label: '=', needsValue: true },
  { id: 'gte', label: '>=', needsValue: true },
  { id: 'lte', label: '<=', needsValue: true },
];

function IssueFieldFiltersUI({
  filters,
  onChange,
}: {
  filters: IssueFieldFilter[];
  onChange: (filters: IssueFieldFilter[]) => void;
}) {
  function addFilter() {
    onChange([...filters, { field: 'originalEstimateHours', operator: 'is_null_or_zero' }]);
  }

  function updateFilter(index: number, patch: Partial<IssueFieldFilter>) {
    const updated = filters.map((f, i) => i === index ? { ...f, ...patch } : f);
    onChange(updated);
  }

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label style={miniLabel}>Conditions sur champs issue</label>

      {filters.map((filter, i) => {
        const opDef = ISSUE_FIELD_OPERATORS.find((o) => o.id === filter.operator);
        return (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select
              value={filter.field}
              onChange={(e) => updateFilter(i, { field: e.target.value as IssueFieldFilter['field'] })}
              style={{ ...selectStyle, maxWidth: 200 }}
            >
              {ISSUE_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>

            <select
              value={filter.operator}
              onChange={(e) => updateFilter(i, { operator: e.target.value as IssueFieldFilter['operator'], value: undefined })}
              style={selectStyle}
            >
              {ISSUE_FIELD_OPERATORS.map((op) => (
                <option key={op.id} value={op.id}>{op.label}</option>
              ))}
            </select>

            {opDef?.needsValue && (
              <input
                type="number"
                value={filter.value ?? ''}
                onChange={(e) => updateFilter(i, { value: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="valeur"
                style={{ ...inputStyle, width: 80, minWidth: 60 }}
              />
            )}

            <button
              onClick={() => removeFilter(i)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}
            >
              ×
            </button>
          </div>
        );
      })}

      <button onClick={addFilter} style={{
        padding: '3px 10px', fontSize: 12, color: '#4f46e5', background: '#eef2ff',
        border: '1px solid #c7d2fe', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
      }}>
        + Condition sur champ
      </button>
    </div>
  );
}

// ── Filtres champs custom ──

const OPERATORS: { id: CustomFieldFilter['operator']; label: string }[] = [
  { id: 'equals', label: '=' },
  { id: 'not_equals', label: '!=' },
  { id: 'gte', label: '>=' },
  { id: 'lte', label: '<=' },
  { id: 'in', label: 'dans' },
  { id: 'not_in', label: 'pas dans' },
  { id: 'between', label: 'entre' },
  { id: 'is_null', label: 'est vide' },
  { id: 'not_null', label: "n'est pas vide" },
];

/**
 * Champ de saisie de valeur : cases à cocher si le champ a des allowedValues, sinon texte libre.
 */
function FieldValueInput({
  filter,
  field,
  onChange,
}: {
  filter: CustomFieldFilter;
  field?: JiraCustomFieldInfo;
  onChange: (value: string | string[]) => void;
}) {
  const options = field?.options ?? [];
  const isMulti = ['in', 'not_in', 'equals', 'not_equals'].includes(filter.operator);
  const currentValues = Array.isArray(filter.value)
    ? filter.value
    : filter.value ? [filter.value] : [];
  const selectedSet = new Set(currentValues);

  // Mode cases à cocher si le champ a des options
  if (options.length > 0 && options.length <= 40) {
    function toggle(val: string) {
      const next = new Set(selectedSet);
      if (next.has(val)) next.delete(val); else next.add(val);
      const arr = [...next];
      onChange(isMulti ? arr : arr[0] ?? '');
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
        {options.map((opt) => {
          const checked = selectedSet.has(opt.value);
          return (
            <label key={opt.id} style={{
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer',
              padding: '1px 6px', borderRadius: 4,
              background: checked ? '#dbeafe' : '#f3f4f6',
              color: checked ? '#1d4ed8' : '#374151',
              border: checked ? '1px solid #93c5fd' : '1px solid #e5e7eb',
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)}
                style={{ accentColor: '#4f46e5', width: 11, height: 11 }} />
              {opt.value}
            </label>
          );
        })}
      </div>
    );
  }

  // Widget adapté au fieldType
  if (field?.fieldType === 'date' || field?.fieldType === 'datetime') {
    return (
      <input type="date"
        value={typeof filter.value === 'string' ? filter.value : ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, flex: 1, minWidth: 140 }}
      />
    );
  }

  if (field?.fieldType === 'number') {
    return (
      <input type="number"
        value={typeof filter.value === 'string' ? filter.value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="valeur numerique"
        style={{ ...inputStyle, flex: 1, minWidth: 100 }}
      />
    );
  }

  // Between : deux inputs min/max
  if (filter.operator === 'between') {
    const vals = Array.isArray(filter.value) ? filter.value : ['', ''];
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
        <input type="number" value={vals[0] ?? ''} placeholder="min"
          onChange={(e) => onChange([e.target.value, vals[1] ?? ''])}
          style={{ ...inputStyle, width: 80, minWidth: 60 }} />
        <span style={{ fontSize: 11, color: '#6b7280' }}>et</span>
        <input type="number" value={vals[1] ?? ''} placeholder="max"
          onChange={(e) => onChange([vals[0] ?? '', e.target.value])}
          style={{ ...inputStyle, width: 80, minWidth: 60 }} />
      </div>
    );
  }

  // >= / <= : input numérique
  if (['gte', 'lte'].includes(filter.operator)) {
    return (
      <input type="number"
        value={typeof filter.value === 'string' ? filter.value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={filter.operator === 'gte' ? 'min' : 'max'}
        style={{ ...inputStyle, flex: 1, minWidth: 80 }}
      />
    );
  }

  // Mode texte libre
  return (
    <input
      value={Array.isArray(filter.value) ? filter.value.join(', ') : (filter.value ?? '')}
      onChange={(e) => {
        const val = ['in', 'not_in'].includes(filter.operator)
          ? e.target.value.split(',').map((s) => s.trim())
          : e.target.value;
        onChange(val);
      }}
      placeholder={['in', 'not_in'].includes(filter.operator) ? 'val1, val2, val3' : 'valeur'}
      style={{ ...inputStyle, flex: 1, minWidth: 100 }}
    />
  );
}

function CustomFieldFiltersUI({
  filters,
  logic,
  onChange,
  clientId,
}: {
  filters: CustomFieldFilter[];
  logic: 'AND' | 'OR';
  onChange: (filters: CustomFieldFilter[], logic: 'AND' | 'OR') => void;
  clientId?: number;
}) {
  const { data: customFields } = useQuery({
    queryKey: ['custom-fields-db', clientId],
    queryFn: () => clientsApi.getCustomFields(clientId!),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const cfList = customFields ?? [];

  function addFilter() {
    const firstField = cfList[0]?.id ?? 'customfield_10000';
    onChange([...filters, { fieldId: firstField, operator: 'equals', value: '' }], logic);
  }

  function updateFilter(index: number, patch: Partial<CustomFieldFilter>) {
    const updated = filters.map((f, i) => i === index ? { ...f, ...patch } : f);
    onChange(updated, logic);
  }

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index), logic);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label style={miniLabel}>Filtres champs custom</label>
        {filters.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['AND', 'OR'] as const).map((l) => (
              <button
                key={l}
                onClick={() => onChange(filters, l)}
                style={{
                  padding: '1px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                  border: logic === l ? '2px solid #4f46e5' : '1px solid #d1d5db',
                  background: logic === l ? '#eef2ff' : 'white',
                  color: logic === l ? '#4f46e5' : '#6b7280',
                }}
              >
                {l === 'AND' ? 'ET (tous)' : 'OU (au moins un)'}
              </button>
            ))}
          </div>
        )}
      </div>

      {filters.map((filter, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          {i > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', minWidth: 24, textAlign: 'center' }}>
              {logic}
            </span>
          )}
          {i === 0 && filters.length > 1 && <span style={{ minWidth: 24 }} />}

          {/* Champ */}
          <select
            value={filter.fieldId}
            onChange={(e) => updateFilter(i, { fieldId: e.target.value })}
            style={{ ...selectStyle, maxWidth: 220 }}
          >
            {cfList.length === 0 && <option value={filter.fieldId}>{filter.fieldId}</option>}
            {cfList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.fieldType})
              </option>
            ))}
          </select>

          {/* Opérateur */}
          <select
            value={filter.operator}
            onChange={(e) => updateFilter(i, { operator: e.target.value as CustomFieldFilter['operator'] })}
            style={selectStyle}
          >
            {OPERATORS.map((op) => (
              <option key={op.id} value={op.id}>{op.label}</option>
            ))}
          </select>

          {/* Valeur */}
          {!['is_null', 'not_null'].includes(filter.operator) && (
            <FieldValueInput
              filter={filter}
              field={cfList.find((f) => f.id === filter.fieldId)}
              onChange={(val) => updateFilter(i, { value: val })}
            />
          )}

          {/* Supprimer */}
          <button
            onClick={() => removeFilter(i)}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}
          >
            {'×'}
          </button>
        </div>
      ))}

      <button onClick={addFilter} style={{
        padding: '3px 10px', fontSize: 12, color: '#4f46e5', background: '#eef2ff',
        border: '1px solid #c7d2fe', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
      }}>
        + Ajouter un filtre custom
      </button>
    </div>
  );
}

// ── NodeEditor récursif ──

function NodeEditor({
  node,
  onChange,
  metrics,
  depth,
  clientId,
  globalJiraContext,
}: {
  node: FormulaNode;
  onChange: (n: FormulaNode) => void;
  metrics: MetricInfo[];
  depth: number;
  clientId?: number;
  globalJiraContext?: {
    jiraConnections: JiraConnection[];
    selectedConnectionId?: number;
    onConnectionChange: (jiraConnectionId: number | undefined) => void;
  };
}) {
  const [openPanel, setOpenPanel] = useState<'perimetre' | 'filtres' | null>(null);
  const bgColors = ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0'];
  const bg = bgColors[Math.min(depth, bgColors.length - 1)];

  const hasLocalFilters = node.filters && Object.keys(node.filters).some((k) => {
    const v = (node.filters as Record<string, unknown>)[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'object') return true;
    return !!v;
  });

  const localFilterCount = !node.filters ? 0 : [
    (node.filters.issueTypes?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.statuses?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.labels?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.components?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.customFieldFilters?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.excludeJiraKeys?.length ?? 0) > 0 ? 1 : 0,
    (node.filters.issueFieldFilters?.length ?? 0) > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div style={{ background: bg, borderRadius: 4, padding: depth > 0 ? 4 : 0 }}>
      {/* Sélection du type de noeud */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
        <select
          value={node.type}
          onChange={(e) => {
            const type = e.target.value as FormulaNode['type'];
            if (type === 'metric') onChange({ type: 'metric', id: 'consomme' });
            else if (type === 'constant') onChange({ type: 'constant', value: 0 });
            else onChange({ type: 'function', name: 'sum', args: [{ type: 'metric', id: 'consomme' }] });
          }}
          style={selectStyle}
        >
          <option value="function">Fonction</option>
          <option value="metric">Metrique</option>
          <option value="constant">Constante</option>
        </select>

        {node.type === 'function' && (
          <>
            <select
              value={node.name}
              onChange={(e) => {
                const fn = FUNCTIONS.find((f) => f.id === e.target.value)!;
                const args = Array.from({ length: fn.arity }, (_, i) => node.args?.[i] ?? { type: 'metric' as const, id: 'consomme' });
                onChange({ type: 'function', name: fn.id, args, ...(node.filters ? { filters: node.filters } : {}) });
              }}
              style={selectStyle}
            >
              {FUNCTIONS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>

            {/* Bouton Périmètre */}
            <button
              onClick={() => setOpenPanel(openPanel === 'perimetre' ? null : 'perimetre')}
              title="Perimetre : regle de selection des issues"
              style={{
                padding: '1px 7px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: openPanel === 'perimetre' || node.filters?.scopeRule ? '1px solid #8b5cf6' : '1px solid #d1d5db',
                background: openPanel === 'perimetre' ? '#f5f3ff' : node.filters?.scopeRule ? '#ede9fe' : 'white',
                color: node.filters?.scopeRule ? '#6d28d9' : '#6b7280',
                fontWeight: node.filters?.scopeRule ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              🎯 Perimetre
            </button>

            {/* Bouton Filtres */}
            <button
              onClick={() => setOpenPanel(openPanel === 'filtres' ? null : 'filtres')}
              title="Filtres : types, statuts, labels, champs custom..."
              style={{
                padding: '1px 7px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: openPanel === 'filtres' ? '1px solid #8b5cf6' : hasLocalFilters ? '1px solid #8b5cf6' : '1px solid #d1d5db',
                background: openPanel === 'filtres' ? '#f5f3ff' : hasLocalFilters ? '#ede9fe' : 'white',
                color: hasLocalFilters ? '#6d28d9' : '#6b7280',
                fontWeight: hasLocalFilters ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              🔍 Filtres{localFilterCount > 0 ? ` (${localFilterCount})` : ''}
            </button>
          </>
        )}

        {node.type === 'metric' && (
          <select
            value={node.id}
            onChange={(e) => onChange({ type: 'metric', id: e.target.value })}
            style={{ ...selectStyle, flex: 1 }}
          >
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}

        {node.type === 'constant' && (
          <input
            type="number"
            value={node.value ?? 0}
            onChange={(e) => onChange({ type: 'constant', value: Number(e.target.value) })}
            style={{ ...inputStyle, width: 100 }}
          />
        )}
      </div>

      {/* Panneau Périmètre */}
      {node.type === 'function' && openPanel === 'perimetre' && (
        <div style={{
          margin: '4px 0 4px 12px', padding: 8, borderRadius: 6,
          border: '1px dashed #8b5cf6', background: '#faf5ff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>
              🎯 Perimetre — {node.name}
            </span>
            <span style={{ fontSize: 10, color: '#9ca3af', flex: 1 }}>
              (surcharge le perimetre global pour cette branche)
            </span>
            {(node.filters ?? {}).scopeRule && (
              <button
                onClick={() => {
                  const { scopeRule: _, ...rest } = node.filters ?? {};
                  onChange({ ...node, filters: Object.keys(rest).length > 0 ? rest : undefined });
                }}
                title="Reinitialiser le perimetre (heriter du parent)"
                style={{
                  padding: '1px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                  border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 600,
                }}
              >
                Reinitialiser
              </button>
            )}
          </div>
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={miniLabel}>Perimetre (regle de selection des issues)</label>
              <ScopeRuleEditor
                clientId={clientId}
                globalJiraContext={globalJiraContext}
                value={(node.filters ?? {}).scopeRule}
                onChange={(rule) => onChange({ ...node, filters: { ...(node.filters ?? {}), scopeRule: rule } })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Panneau Filtres */}
      {node.type === 'function' && openPanel === 'filtres' && (
        <div style={{
          margin: '4px 0 4px 12px', padding: 8, borderRadius: 6,
          border: '1px dashed #8b5cf6', background: '#faf5ff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>
              🔍 Filtres — {node.name}
            </span>
            <span style={{ fontSize: 10, color: '#9ca3af', flex: 1 }}>
              (surcharge les filtres globaux pour cette branche)
            </span>
            {localFilterCount > 0 && (
              <button
                onClick={() => {
                  const scopeRule = (node.filters ?? {}).scopeRule;
                  onChange({ ...node, filters: scopeRule ? { scopeRule } : undefined });
                }}
                title="Reinitialiser les filtres (heriter du parent)"
                style={{
                  padding: '1px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                  border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 600,
                }}
              >
                Reinitialiser
              </button>
            )}
          </div>
          <FilterCheckboxes
            filters={node.filters ?? {}}
            onChange={(localFilters) => onChange({ ...node, filters: localFilters })}
            clientId={clientId}
            globalJiraContext={globalJiraContext}
            hidePerimetre
          />
        </div>
      )}

      {/* Arguments récursifs */}
      {node.type === 'function' && node.args && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 12, borderLeft: '2px solid #d1d5db', paddingLeft: 8 }}>
          {node.args.map((arg, i) => (
            <div key={i}>
              <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>
                {node.args!.length === 1 ? '' : i === 0 ? 'A' : i === 1 ? 'B' : `Arg ${i + 1}`}
              </span>
              <NodeEditor
                node={arg}
                onChange={(updated) => {
                  const newArgs = [...(node.args ?? [])];
                  newArgs[i] = updated;
                  onChange({ ...node, args: newArgs });
                }}
                metrics={metrics}
                depth={depth + 1}
                clientId={clientId}
                globalJiraContext={globalJiraContext}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const miniLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' as const };
const selectStyle: React.CSSProperties = { padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, background: 'white' };
const btnPrimary: React.CSSProperties = { padding: '6px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: '6px 16px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSqlPreview: React.CSSProperties = { padding: '6px 16px', background: '#faf5ff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

// ── SQL Preview Panel (lecture seule) ──

function SqlPreviewPanel({ ast }: { ast: FormulaAst }) {
  const sql = astToSql(ast);
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ marginTop: 8, border: '1px solid #c4b5fd', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#f5f3ff', borderBottom: '1px solid #c4b5fd' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>SQL equivalent (lecture seule)</span>
        <button
          onClick={() => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ padding: '2px 10px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: copied ? '#d1fae5' : 'white', color: copied ? '#065f46' : '#374151', cursor: 'pointer' }}
        >
          {copied ? '✓ Copie' : 'Copier'}
        </button>
      </div>
      <div
        dangerouslySetInnerHTML={{ __html: highlightSql(sql) }}
        style={{
          margin: 0, padding: 12, fontSize: 13, lineHeight: 1.7,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
          background: '#1e1e2e', color: '#cdd6f4', overflowX: 'auto', maxHeight: 300,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      />
    </div>
  );
}
