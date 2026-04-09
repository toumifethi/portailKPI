import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientsApi, settingsApi, transitionsApi, issuesApi } from '@/api/endpoints';
import type { JiraConnection, ScopeRule, FormulaFilters } from '@/types';

const SCOPE_TYPES = [
  {
    type: 'resolved_in_period' as const,
    label: 'Resolues dans la periode',
    description: 'Issues dont la date de resolution (resolvedAt) tombe dans le mois. Ideal pour les KPI de productivite (tickets livres).',
    icon: '✅',
  },
  {
    type: 'updated_in_period' as const,
    label: 'Mises a jour dans la periode',
    description: 'Issues dont la derniere modification JIRA tombe dans le mois. Large : inclut tout changement (commentaire, statut, champ...).',
    icon: '📝',
  },
  {
    type: 'worklogs_in_period' as const,
    label: 'Avec worklogs dans la periode',
    description: 'Issues ayant un worklog dans le mois, OU dont une sous-tache a un worklog dans le mois. Inclut automatiquement les parents dont une sous-tache a logue du temps.',
    icon: '⏱️',
  },
  {
    type: 'created_in_period' as const,
    label: 'Creees dans la periode',
    description: 'Issues creees dans JIRA pendant le mois. Utile pour mesurer le flux entrant (nouvelles demandes, bugs decouverts).',
    icon: '🆕',
  },
  {
    type: 'sprint_in_period' as const,
    label: 'Dans un sprint de la periode',
    description: 'Issues appartenant a un sprint dont les dates chevauchent le mois. Necessite que les sprints soient configures dans JIRA.',
    icon: '🏃',
  },
  {
    type: 'status_in_period' as const,
    label: 'Transitionees vers un statut cible',
    description: "Issues ayant change de statut vers un des statuts cibles pendant le mois. Necessite que l'import des transitions soit active pour le client.",
    icon: '🔄',
  },
  {
    type: 'linked_to' as const,
    label: 'Liees a une population',
    description: 'Issues liees (via issue links JIRA) a une population de reference. Ex: retours lies aux tickets livres en production.',
    icon: '🔗',
  },
  {
    type: 'combined' as const,
    label: 'Combinaison (ET / OU)',
    description: 'Combine plusieurs regles avec une logique ET (toutes les conditions) ou OU (au moins une condition). Permet des perimetres complexes.',
    icon: '🧩',
  },
];

const STATUS_FALLBACK = 'Done';
const STATUS_SLIDING_WINDOW_DEFAULT_MONTHS = 1;
const STATUS_SLIDING_WINDOW_MAX_MONTHS = 36;
const QUERY_STALE_TIME = 60_000;
const GLOBAL_STATUS_FALLBACK_SETTING_KEY = 'kpi.formula.statusInPeriod.globalFallbackStatuses';

interface ScopeRuleEditorProps {
  value: ScopeRule | undefined;
  onChange: (rule: ScopeRule) => void;
  clientId?: number;
  globalJiraContext?: {
    jiraConnections: JiraConnection[];
    selectedConnectionId?: number;
    onConnectionChange: (jiraConnectionId: number | undefined) => void;
  };
}

export function ScopeRuleEditor({ value, onChange, clientId, globalJiraContext }: ScopeRuleEditorProps) {
  const currentType = value?.type ?? 'resolved_in_period';
  const jiraConnections = globalJiraContext?.jiraConnections ?? [];
  const selectedConnectionId = globalJiraContext?.selectedConnectionId;

  const { data: clientStatusesData, isLoading: isClientStatusesLoading } = useQuery({
    queryKey: ['transition-statuses', clientId],
    queryFn: () => transitionsApi.statuses(clientId),
    enabled: typeof clientId === 'number' && clientId > 0,
    staleTime: QUERY_STALE_TIME,
  });

  const { data: connectionStatusesData, isLoading: isConnectionStatusesLoading } = useQuery({
    queryKey: ['transition-statuses-by-jira-connection', selectedConnectionId],
    queryFn: () => transitionsApi.statusesByJiraConnection(selectedConnectionId!),
    enabled: !clientId && typeof selectedConnectionId === 'number' && selectedConnectionId > 0,
    staleTime: QUERY_STALE_TIME,
  });

  // En mode client : si aucune transition n'est importee pour ce client, on cherche
  // la connexion JIRA parente pour proposer un fallback de statuts.
  const { data: clientData } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: typeof clientId === 'number' && clientId > 0,
    staleTime: QUERY_STALE_TIME,
  });

  const clientHasNoTransitions =
    !isClientStatusesLoading &&
    typeof clientId === 'number' &&
    clientId > 0 &&
    (clientStatusesData?.toStatuses ?? []).length === 0;

  const clientJiraConnectionId =
    typeof clientData?.jiraConnectionId === 'number' ? clientData.jiraConnectionId : undefined;

  const { data: clientConnectionFallbackData, isLoading: isClientConnectionFallbackLoading } = useQuery({
    queryKey: ['transition-statuses-by-jira-connection', clientJiraConnectionId],
    queryFn: () => transitionsApi.statusesByJiraConnection(clientJiraConnectionId!),
    enabled: clientHasNoTransitions && typeof clientJiraConnectionId === 'number',
    staleTime: QUERY_STALE_TIME,
  });

  const { data: appSettings, isLoading: isAppSettingsLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: settingsApi.getAll,
    enabled: !clientId,
    staleTime: QUERY_STALE_TIME,
  });

  const appSettingFallbackStatuses = useMemo(() => {
    const settingValue = appSettings?.find((setting) => setting.key === GLOBAL_STATUS_FALLBACK_SETTING_KEY)?.value;
    return parseStatusSetting(settingValue);
  }, [appSettings]);

  const isUsingClientConnectionFallback =
    clientHasNoTransitions && (clientConnectionFallbackData?.toStatuses ?? []).length > 0;

  const availableStatusTargets = useMemo(() => {
    let dynamicStatuses: string[];
    if (clientId) {
      const clientStatuses = clientStatusesData?.toStatuses ?? [];
      dynamicStatuses = clientStatuses.length > 0
        ? clientStatuses
        : (clientConnectionFallbackData?.toStatuses ?? []);
    } else if (selectedConnectionId) {
      dynamicStatuses = connectionStatusesData?.toStatuses ?? [];
    } else {
      dynamicStatuses = appSettingFallbackStatuses;
    }
    return mergeStatusOptions(value?.type === 'status_in_period' ? value.statuses : [], dynamicStatuses);
  }, [appSettingFallbackStatuses, clientId, clientStatusesData?.toStatuses, clientConnectionFallbackData?.toStatuses, connectionStatusesData?.toStatuses, selectedConnectionId, value]);

  const isStatusTargetsLoading = clientId
    ? (isClientStatusesLoading || (clientHasNoTransitions && isClientConnectionFallbackLoading))
    : selectedConnectionId
      ? isConnectionStatusesLoading
      : isAppSettingsLoading;

  function selectType(type: string) {
    switch (type) {
      case 'resolved_in_period':
      case 'updated_in_period':
      case 'worklogs_in_period':
      case 'created_in_period':
      case 'sprint_in_period':
        onChange({ type } as ScopeRule);
        break;
      case 'status_in_period':
        onChange({
          type: 'status_in_period',
          statuses: getDefaultStatuses(availableStatusTargets),
          slidingWindowMonths: value?.type === 'status_in_period'
            ? normalizeSlidingWindowMonths(value.slidingWindowMonths)
            : STATUS_SLIDING_WINDOW_DEFAULT_MONTHS,
        });
        break;
      case 'linked_to':
        onChange({
          type: 'linked_to',
          baseScope: { type: 'status_in_period', statuses: getDefaultStatuses(availableStatusTargets), slidingWindowMonths: 1 },
          baseFilters: { issueTypes: [] },
          linkTypeContains: 'est un retour de',
          direction: 'source',
        });
        break;
      case 'combined':
        onChange({
          type: 'combined',
          rules: [{ type: 'resolved_in_period' }, { type: 'worklogs_in_period' }],
          logic: 'OR',
        });
        break;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {SCOPE_TYPES.map((scope) => {
        const isSelected = currentType === scope.type;
        return (
          <div key={scope.type}>
            <label
              onClick={() => selectType(scope.type)}
              style={{
                display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                background: isSelected ? '#eef2ff' : '#ffffff',
                border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="scopeRule"
                checked={isSelected}
                onChange={() => selectType(scope.type)}
                style={{ accentColor: '#4f46e5', marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{scope.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#4f46e5' : '#111827' }}>
                    {scope.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>
                  {scope.description}
                </div>
              </div>
            </label>

            {/* Sous-options pour status_in_period */}
            {isSelected && scope.type === 'status_in_period' && value?.type === 'status_in_period' && (
              <StatusTargetEditor
                clientId={clientId}
                statuses={value.statuses}
                jiraConnections={jiraConnections}
                selectedConnectionId={selectedConnectionId}
                onConnectionChange={globalJiraContext?.onConnectionChange ?? (() => undefined)}
                options={availableStatusTargets}
                isLoading={isStatusTargetsLoading}
                isUsingAppSettingsFallback={!clientId && !selectedConnectionId}
                hasConfiguredAppSettingsFallback={appSettingFallbackStatuses.length > 0}
                isUsingClientConnectionFallback={isUsingClientConnectionFallback}
                slidingWindowMonths={normalizeSlidingWindowMonths(value.slidingWindowMonths)}
                onSlidingWindowMonthsChange={(slidingWindowMonths) => onChange({
                  type: 'status_in_period',
                  statuses: value.statuses,
                  slidingWindowMonths,
                })}
                onChange={(statuses) => onChange({
                  type: 'status_in_period',
                  statuses,
                  slidingWindowMonths: normalizeSlidingWindowMonths(value.slidingWindowMonths),
                })}
              />
            )}

            {/* Sous-options pour linked_to */}
            {isSelected && scope.type === 'linked_to' && value?.type === 'linked_to' && (
              <LinkedToEditor
                value={value}
                onChange={onChange}
                clientId={clientId}
              />
            )}

            {/* Sous-options pour combined */}
            {isSelected && scope.type === 'combined' && value?.type === 'combined' && (
              <CombinedRuleEditor
                rules={value.rules}
                logic={value.logic}
                onChange={(rules, logic) => onChange({ type: 'combined', rules, logic })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusTargetEditor({
  clientId,
  statuses,
  jiraConnections,
  selectedConnectionId,
  onConnectionChange,
  options,
  isLoading,
  isUsingAppSettingsFallback,
  hasConfiguredAppSettingsFallback,
  isUsingClientConnectionFallback,
  slidingWindowMonths,
  onSlidingWindowMonthsChange,
  onChange,
}: {
  clientId?: number;
  statuses: string[];
  jiraConnections: Array<{ id: number; name: string; jiraUrl: string }>;
  selectedConnectionId?: number;
  onConnectionChange: (jiraConnectionId: number | undefined) => void;
  options: string[];
  isLoading: boolean;
  isUsingAppSettingsFallback: boolean;
  hasConfiguredAppSettingsFallback: boolean;
  isUsingClientConnectionFallback: boolean;
  slidingWindowMonths: number;
  onSlidingWindowMonthsChange: (slidingWindowMonths: number) => void;
  onChange: (statuses: string[]) => void;
}) {
  const selected = new Set(statuses);

  function toggle(status: string) {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status); else next.add(status);
    onChange([...next]);
  }

  let helperMessage: string | null = null;
  let helperIsInfo = false;
  if (isLoading) {
    helperMessage = 'Chargement des statuts de transition...';
  } else if (clientId && isUsingClientConnectionFallback) {
    helperMessage = 'Aucune transition importee pour ce client. Affichage des statuts de la connexion JIRA parente.';
    helperIsInfo = true;
  } else if (clientId && options.length === 0) {
    helperMessage = "Aucune transition importee pour ce client. Activez l'import des transitions dans la configuration du client.";
  } else if (!clientId && jiraConnections.length === 0) {
    helperMessage = 'Aucune connexion JIRA disponible pour charger les statuts.';
  } else if (!clientId && !selectedConnectionId && isUsingAppSettingsFallback && hasConfiguredAppSettingsFallback) {
    helperMessage = 'Aucune connexion JIRA selectionnee : affichage des statuts de fallback configures dans App Settings.';
    helperIsInfo = true;
  } else if (!clientId && !selectedConnectionId) {
    helperMessage = `Selectionnez une connexion JIRA de reference ou configurez l\'App Setting ${GLOBAL_STATUS_FALLBACK_SETTING_KEY}.`;
  } else if (options.length === 0) {
    helperMessage = 'Aucun statut de transition trouve pour cette connexion JIRA.';
  }

  return (
    <div style={{ marginLeft: 36, marginTop: 6, padding: 10, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
      {!clientId && jiraConnections.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Instance JIRA de reference :</div>
          <select
            value={selectedConnectionId ?? ''}
            onChange={(e) => onConnectionChange(e.target.value ? Number(e.target.value) : undefined)}
            style={{ padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, width: '100%', background: 'white' }}
          >
            <option value="">-- Selectionner une instance --</option>
            {jiraConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.name} ({connection.jiraUrl})</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>Statuts cibles :</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Fenetre glissante (mois) :</div>
        <input
          type="number"
          min={1}
          max={STATUS_SLIDING_WINDOW_MAX_MONTHS}
          value={slidingWindowMonths}
          onChange={(e) => onSlidingWindowMonthsChange(normalizeSlidingWindowMonths(Number(e.target.value)))}
          style={{ width: 72, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
        />
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          Exemple: 3 = mois courant + 2 mois precedents
        </div>
      </div>
      {helperMessage && (
        <div style={{
          fontSize: 11, marginBottom: 8, borderRadius: 4, padding: '6px 8px',
          ...(helperIsInfo
            ? { color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe' }
            : { color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' }),
        }}>
          {helperMessage}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((s) => (
          <label key={s} style={{
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer',
            padding: '2px 8px', borderRadius: 4,
            background: selected.has(s) ? '#d1fae5' : '#f3f4f6',
            color: selected.has(s) ? '#065f46' : '#374151',
            border: selected.has(s) ? '1px solid #86efac' : '1px solid #e5e7eb',
          }}>
            <input type="checkbox" checked={selected.has(s)} onChange={() => toggle(s)}
              style={{ accentColor: '#059669', width: 11, height: 11 }} />
            {s}
          </label>
        ))}
      </div>
    </div>
  );
}

function mergeStatusOptions(selectedStatuses: string[], fetchedStatuses: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const status of [...fetchedStatuses, ...selectedStatuses]) {
    if (!status || seen.has(status)) continue;
    seen.add(status);
    merged.push(status);
  }

  return merged;
}

function parseStatusSetting(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return [];
  }

  if (trimmedValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmedValue);
      if (Array.isArray(parsed)) {
        return normalizeStatuses(parsed.map((status) => String(status)));
      }
    } catch {
      // Ignore invalid JSON and fallback to delimited parsing.
    }
  }

  return normalizeStatuses(trimmedValue.split(/[\n,;]+/));
}

function normalizeStatuses(statuses: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const status of statuses.map((value) => value.trim()).filter(Boolean)) {
    if (seen.has(status)) {
      continue;
    }

    seen.add(status);
    normalized.push(status);
  }

  return normalized;
}

function getDefaultStatuses(availableStatuses: string[]): string[] {
  if (availableStatuses.includes(STATUS_FALLBACK)) {
    return [STATUS_FALLBACK];
  }
  return availableStatuses.length > 0 ? [availableStatuses[0]] : [];
}

function normalizeSlidingWindowMonths(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return STATUS_SLIDING_WINDOW_DEFAULT_MONTHS;
  }

  return Math.max(1, Math.min(STATUS_SLIDING_WINDOW_MAX_MONTHS, Math.trunc(value)));
}

const SIMPLE_RULES: Array<{ type: ScopeRule['type']; label: string }> = [
  { type: 'resolved_in_period', label: 'Resolues' },
  { type: 'updated_in_period', label: 'Mises a jour' },
  { type: 'worklogs_in_period', label: 'Avec worklogs' },
  { type: 'created_in_period', label: 'Creees' },
  { type: 'sprint_in_period', label: 'Dans un sprint' },
];

const LINKED_TO_BASE_SCOPES: Array<{ type: ScopeRule['type']; label: string }> = [
  { type: 'resolved_in_period', label: 'Resolues dans la periode' },
  { type: 'updated_in_period', label: 'Mises a jour dans la periode' },
  { type: 'worklogs_in_period', label: 'Avec worklogs dans la periode' },
  { type: 'created_in_period', label: 'Creees dans la periode' },
  { type: 'sprint_in_period', label: 'Dans un sprint de la periode' },
  { type: 'status_in_period', label: 'Transitionees vers un statut cible' },
];

function LinkedToEditor({
  value,
  onChange,
  clientId,
}: {
  value: Extract<ScopeRule, { type: 'linked_to' }>;
  onChange: (rule: ScopeRule) => void;
  clientId?: number;
}) {
  const { data: issueTypes } = useQuery({
    queryKey: ['issueTypes'],
    queryFn: issuesApi.listTypes,
    staleTime: 60_000,
  });

  const { data: linkTypes = [] } = useQuery({
    queryKey: ['link-types', clientId],
    queryFn: () => issuesApi.listLinkTypes(clientId),
    staleTime: 60_000,
  });

  const [customLinkType, setCustomLinkType] = useState(false);

  const baseIssueTypes = new Set(value.baseFilters?.issueTypes ?? []);

  function toggleBaseIssueType(type: string) {
    const next = new Set(baseIssueTypes);
    if (next.has(type)) next.delete(type); else next.add(type);
    onChange({ ...value, baseFilters: { ...value.baseFilters, issueTypes: [...next] } });
  }

  function updateBaseScope(type: string) {
    if (type === 'status_in_period') {
      onChange({
        ...value,
        baseScope: { type: 'status_in_period', statuses: ['Done', 'Closed', 'Resolved'], slidingWindowMonths: 1 },
      });
    } else {
      onChange({ ...value, baseScope: { type } as ScopeRule });
    }
  }

  const selectStyle: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, background: 'white' };
  const inputStyle: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box' as const };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 };

  return (
    <div style={{ marginLeft: 36, marginTop: 6, padding: 12, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Population de référence */}
      <div style={{ padding: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Population de reference</div>

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Scope</label>
          <select value={value.baseScope.type} onChange={(e) => updateBaseScope(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {LINKED_TO_BASE_SCOPES.map((s) => (
              <option key={s.type} value={s.type}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Statuts cibles si status_in_period */}
        {value.baseScope.type === 'status_in_period' && (
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Statuts cibles</label>
            <input
              value={(value.baseScope as Extract<ScopeRule, { type: 'status_in_period' }>).statuses.join(', ')}
              onChange={(e) => onChange({
                ...value,
                baseScope: {
                  type: 'status_in_period',
                  statuses: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  slidingWindowMonths: (value.baseScope as Extract<ScopeRule, { type: 'status_in_period' }>).slidingWindowMonths,
                },
              })}
              placeholder="Done, LIVRE EN PRODUCTION"
              style={inputStyle}
            />
          </div>
        )}

        <div>
          <label style={labelStyle}>Types d'issues de la population {baseIssueTypes.size === 0 && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(tous)</span>}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(issueTypes ?? ['Epic', 'Story', 'Bug', 'Task', 'Sub-task']).map((type) => (
              <label key={type} style={{
                display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer',
                padding: '2px 7px', borderRadius: 4,
                background: baseIssueTypes.has(type) ? '#dbeafe' : '#f3f4f6',
                color: baseIssueTypes.has(type) ? '#1d4ed8' : '#374151',
                border: baseIssueTypes.has(type) ? '1px solid #93c5fd' : '1px solid #e5e7eb',
              }}>
                <input type="checkbox" checked={baseIssueTypes.has(type)} onChange={() => toggleBaseIssueType(type)}
                  style={{ accentColor: '#4f46e5', width: 11, height: 11 }} />
                {type}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Configuration du lien */}
      <div>
        <label style={labelStyle}>Type de lien</label>
        {!customLinkType && linkTypes.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={linkTypes.includes(value.linkTypeContains) ? value.linkTypeContains : ''}
              onChange={(e) => onChange({ ...value, linkTypeContains: e.target.value })}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="" disabled>-- Selectionner un type de lien --</option>
              {linkTypes.map((lt) => (
                <option key={lt} value={lt}>{lt}</option>
              ))}
            </select>
            <button
              onClick={() => setCustomLinkType(true)}
              title="Saisie libre"
              style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #d1d5db', borderRadius: 4, background: 'white', color: '#6b7280', cursor: 'pointer' }}
            >
              ✏️
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={value.linkTypeContains}
              onChange={(e) => onChange({ ...value, linkTypeContains: e.target.value })}
              placeholder="ex: est un retour de"
              style={{ ...inputStyle, flex: 1 }}
            />
            {linkTypes.length > 0 && (
              <button
                onClick={() => setCustomLinkType(false)}
                title="Revenir a la liste"
                style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #d1d5db', borderRadius: 4, background: 'white', color: '#6b7280', cursor: 'pointer' }}
              >
                📋
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>L'issue recherchee est</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'source' as const, label: 'Source du lien (ex: le retour pointe vers le ticket principal)' },
            { id: 'target' as const, label: 'Cible du lien (ex: le ticket principal est pointe par le retour)' },
          ]).map((d) => (
            <label key={d.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, cursor: 'pointer',
              padding: '6px 10px', borderRadius: 5, flex: 1,
              background: value.direction === d.id ? '#eef2ff' : '#fff',
              border: value.direction === d.id ? '2px solid #4f46e5' : '1px solid #e5e7eb',
            }}>
              <input type="radio" checked={value.direction === d.id}
                onChange={() => onChange({ ...value, direction: d.id })}
                style={{ accentColor: '#4f46e5', marginTop: 1 }} />
              <span style={{ color: value.direction === d.id ? '#4f46e5' : '#374151' }}>{d.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function CombinedRuleEditor({
  rules,
  logic,
  onChange,
}: {
  rules: ScopeRule[];
  logic: 'AND' | 'OR';
  onChange: (rules: ScopeRule[], logic: 'AND' | 'OR') => void;
}) {
  function addRule() {
    onChange([...rules, { type: 'updated_in_period' }], logic);
  }

  function removeRule(index: number) {
    if (rules.length <= 2) return;
    onChange(rules.filter((_, i) => i !== index), logic);
  }

  function updateRule(index: number, type: string) {
    const updated = rules.map((r, i) =>
      i === index ? ({ type } as ScopeRule) : r,
    );
    onChange(updated, logic);
  }

  return (
    <div style={{ marginLeft: 36, marginTop: 6, padding: 10, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
      {/* Logic toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['AND', 'OR'] as const).map((l) => (
          <button
            key={l}
            onClick={() => onChange(rules, l)}
            style={{
              padding: '2px 10px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
              border: logic === l ? '2px solid #4f46e5' : '1px solid #d1d5db',
              background: logic === l ? '#eef2ff' : 'white',
              color: logic === l ? '#4f46e5' : '#6b7280',
            }}
          >
            {l === 'AND' ? 'ET (toutes les conditions)' : 'OU (au moins une)'}
          </button>
        ))}
      </div>

      {/* Rules */}
      {rules.map((rule, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {i > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', minWidth: 24, textAlign: 'center' }}>
              {logic}
            </span>
          )}
          {i === 0 && <span style={{ minWidth: 24 }} />}
          <select
            value={rule.type}
            onChange={(e) => updateRule(i, e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, flex: 1 }}
          >
            {SIMPLE_RULES.map((sr) => (
              <option key={sr.type} value={sr.type}>{sr.label}</option>
            ))}
          </select>
          {rules.length > 2 && (
            <button onClick={() => removeRule(i)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>
              {'×'}
            </button>
          )}
        </div>
      ))}
      <button onClick={addRule}
        style={{ padding: '2px 8px', fontSize: 11, color: '#4f46e5', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 4, cursor: 'pointer', marginTop: 4 }}>
        + Ajouter une condition
      </button>
    </div>
  );
}
