import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpiApi, collaboratorsApi } from '@/api/endpoints';
import { FormulaEditor } from '@/components/shared/FormulaEditor';
import type { KpiClientConfig, KpiDebugTrace, FormulaAst, Collaborator } from '@/types';

// ── Types locaux ─────────────────────────────────────────────────────────────

interface ThresholdForm {
  redMin: string; redMax: string;
  orangeMin: string; orangeMax: string;
  greenMin: string; greenMax: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

function fromNum(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

function configToForm(config: KpiClientConfig): ThresholdForm {
  return {
    redMin: fromNum(config.thresholdRedMin),
    redMax: fromNum(config.thresholdRedMax),
    orangeMin: fromNum(config.thresholdOrangeMin),
    orangeMax: fromNum(config.thresholdOrangeMax),
    greenMin: fromNum(config.thresholdGreenMin),
    greenMax: fromNum(config.thresholdGreenMax),
  };
}

// ── Affichage seuil inline ────────────────────────────────────────────────────

function ThresholdBadges({ config }: { config: KpiClientConfig }) {
  const badges: React.ReactNode[] = [];

  function badge(color: string, bg: string, label: string, min: number | null, max: number | null) {
    if (min == null && max == null) return;
    const range = [min != null ? `>= ${min}` : null, max != null ? `<= ${max}` : null]
      .filter(Boolean).join(' et ');
    badges.push(
      <span key={label} style={{ padding: '2px 8px', background: bg, color, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
        {label} {range}
      </span>
    );
  }

  badge('#991b1b', '#fee2e2', 'Rouge', config.thresholdRedMin, config.thresholdRedMax);
  badge('#92400e', '#fef3c7', 'Orange', config.thresholdOrangeMin, config.thresholdOrangeMax);
  badge('#065f46', '#d1fae5', 'Vert', config.thresholdGreenMin, config.thresholdGreenMax);

  return badges.length ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>
  ) : (
    <span style={{ fontSize: 11, color: '#9ca3af' }}>Aucun seuil configure</span>
  );
}

// ── Ligne de saisie d'intervalle ──────────────────────────────────────────────

interface IntervalRowProps {
  color: string;
  label: string;
  bg: string;
  minVal: string; maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}

function IntervalRow({ color, label, bg, minVal, maxVal, onMinChange, onMaxChange }: IntervalRowProps) {
  const inputStyle: React.CSSProperties = {
    width: 90, padding: '5px 8px', border: '1px solid #d1d5db',
    borderRadius: 5, fontSize: 12, fontFamily: 'monospace',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: bg, borderRadius: 6 }}>
      <span style={{ fontSize: 16, minWidth: 20 }}>{color}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 60 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#6b7280' }}>min &ge;</label>
        <input type="number" value={minVal} onChange={(e) => onMinChange(e.target.value)}
          placeholder="—" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#6b7280' }}>max &le;</label>
        <input type="number" value={maxVal} onChange={(e) => onMaxChange(e.target.value)}
          placeholder="—" style={inputStyle} />
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af' }}>
        {(minVal || maxVal) ? `-> ${[minVal ? `>= ${minVal}` : null, maxVal ? `<= ${maxVal}` : null].filter(Boolean).join(' et ')}` : 'non configure'}
      </span>
    </div>
  );
}

// ── Modal seuils ──────────────────────────────────────────────────────────────

function ThresholdModal({ config, onClose }: { config: KpiClientConfig; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ThresholdForm>(() => configToForm(config));

  const updateMutation = useMutation({
    mutationFn: () =>
      kpiApi.updateConfig(config.id, {
        thresholdRedMin: toNum(form.redMin),
        thresholdRedMax: toNum(form.redMax),
        thresholdOrangeMin: toNum(form.orangeMin),
        thresholdOrangeMax: toNum(form.orangeMax),
        thresholdGreenMin: toNum(form.greenMin),
        thresholdGreenMax: toNum(form.greenMax),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-configs'] });
      onClose();
    },
  });

  function set(key: keyof ThresholdForm) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 28, width: 520, maxWidth: '95vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>
          Seuils d'alerte
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
          {config.kpiDefinition?.name} — chaque borne est optionnelle
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          <IntervalRow color="🔴" label="Rouge" bg="#fef2f2"
            minVal={form.redMin} maxVal={form.redMax}
            onMinChange={set('redMin')} onMaxChange={set('redMax')} />
          <IntervalRow color="🟠" label="Orange" bg="#fffbeb"
            minVal={form.orangeMin} maxVal={form.orangeMax}
            onMinChange={set('orangeMin')} onMaxChange={set('orangeMax')} />
          <IntervalRow color="🟢" label="Vert" bg="#f0fdf4"
            minVal={form.greenMin} maxVal={form.greenMax}
            onMinChange={set('greenMin')} onMaxChange={set('greenMax')} />
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
          Priorite : Rouge &gt; Orange &gt; Vert. Le premier intervalle correspondant est applique.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            style={{ padding: '7px 20px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface ClientKpiSectionProps {
  clientId: number;
}

export function ClientKpiSection({ clientId }: ClientKpiSectionProps) {
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<KpiClientConfig | null>(null);
  const [editingFormulaConfigId, setEditingFormulaConfigId] = useState<number | null>(null);
  const [assigningAll, setAssigningAll] = useState(false);

  // ── Queries ──
  const { data: configs, isLoading: loadingConfigs } = useQuery({
    queryKey: ['kpi-configs', clientId],
    queryFn: () => kpiApi.getConfigs(clientId),
  });

  const { data: allDefinitions } = useQuery({
    queryKey: ['kpi-definitions'],
    queryFn: kpiApi.getDefinitions,
  });

  // ── Mutations ──
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      kpiApi.updateConfig(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }),
  });

  const assignMutation = useMutation({
    mutationFn: (kpiDefinitionId: number) =>
      kpiApi.assignToClient(clientId, kpiDefinitionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (configId: number) => kpiApi.removeConfig(configId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }),
  });

  const resetFormulaMutation = useMutation({
    mutationFn: (configId: number) => kpiApi.updateConfig(configId, { formulaAstOverride: null } as Partial<KpiClientConfig>),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }),
  });

  const setDebugMutation = useMutation({
    mutationFn: ({ id, debugMode, debugCollaboratorId }: { id: number; debugMode: boolean; debugCollaboratorId: number | null }) =>
      kpiApi.updateConfig(id, { debugMode, debugCollaboratorId } as Partial<KpiClientConfig>),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }),
  });

  const { data: clientCollaborators } = useQuery({
    queryKey: ['collaborators-list', clientId],
    queryFn: () => collaboratorsApi.list({ clientId }),
  });

  const [viewingDebugConfigId, setViewingDebugConfigId] = useState<number | null>(null);

  // ── Derived data ──
  const assignedIds = new Set((configs ?? []).map((c) => c.kpiDefinitionId));
  const unassignedDefs = (allDefinitions ?? []).filter((d) => !assignedIds.has(d.id));

  // ── Assign all handler ──
  async function handleAssignAll() {
    if (unassignedDefs.length === 0) return;
    setAssigningAll(true);
    try {
      for (const def of unassignedDefs) {
        await kpiApi.assignToClient(clientId, def.id);
      }
      queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] });
    } finally {
      setAssigningAll(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* ── KPIs du client ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>
          KPIs du client
        </h3>

        {loadingConfigs && <div style={{ color: '#6b7280', fontSize: 13 }}>Chargement…</div>}

        {!loadingConfigs && !configs?.length && (
          <div style={{ padding: '24px 16px', border: '2px dashed #e5e7eb', borderRadius: 8, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Aucun KPI assigne a ce client. Utilisez la section "KPIs disponibles" ci-dessous pour en ajouter.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {configs?.map((config) => (
            <div key={config.id} style={{
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                    {config.kpiDefinition?.name ?? `KPI #${config.id}`}
                  </div>
                  {config.kpiDefinition?.description && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {config.kpiDefinition.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {config.kpiDefinition?.formulaType}
                    {config.kpiDefinition?.unit && ` · unite : ${config.kpiDefinition.unit}`}
                    {config.formulaOverride && (
                      <span style={{ marginLeft: 6, color: '#d97706' }}>formule custom</span>
                    )}
                  </div>
                  {/* Profils cibles */}
                  {(() => {
                    const tp = (config.kpiDefinition as unknown as { targetProfiles?: Array<{ profile: { label: string } }> })?.targetProfiles;
                    if (!tp || tp.length === 0) return (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Visible par tous les profils</div>
                    );
                    return (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Profils :</span>
                        {tp.map((t, i) => (
                          <span key={i} style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#ede9fe', color: '#5b21b6', fontWeight: 600 }}>
                            {t.profile.label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Toggle actif */}
                <button
                  onClick={() => toggleActiveMutation.mutate({ id: config.id, isActive: !config.isActive })}
                  disabled={toggleActiveMutation.isPending}
                  style={{
                    padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none',
                    background: config.isActive ? '#d1fae5' : '#f3f4f6',
                    color: config.isActive ? '#065f46' : '#6b7280',
                  }}
                  title={config.isActive ? 'Desactiver ce KPI' : 'Activer ce KPI'}
                >
                  {config.isActive ? 'Actif' : 'Inactif'}
                </button>
              </div>

              {/* Seuils */}
              <ThresholdBadges config={config} />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingConfig(config)}
                  style={{
                    padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6,
                    background: 'white', cursor: 'pointer', fontSize: 12, color: '#374151',
                  }}
                >
                  Configurer les seuils
                </button>
                <button
                  onClick={() => setEditingFormulaConfigId(config.id)}
                  style={{
                    padding: '5px 12px', border: '1px solid #93c5fd', borderRadius: 6,
                    background: '#eff6ff', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', fontWeight: 600,
                  }}
                >
                  {(config as unknown as { formulaAstOverride: unknown }).formulaAstOverride
                    ? 'Formule personnalisee'
                    : 'Personnaliser la formule'}
                </button>
                {(config as unknown as { formulaAstOverride: unknown }).formulaAstOverride && (
                  <button
                    onClick={() => {
                      if (confirm('Reinitialiser avec la formule par defaut de la definition ?')) {
                        resetFormulaMutation.mutate(config.id);
                      }
                    }}
                    style={{
                      padding: '5px 12px', border: '1px solid #d97706', borderRadius: 6,
                      background: '#fffbeb', cursor: 'pointer', fontSize: 12, color: '#92400e', fontWeight: 600,
                    }}
                  >
                    Reinitialiser
                  </button>
                )}
                {/* Dropdown debug */}
                <select
                  value={config.debugMode ? (config.debugCollaboratorId != null ? String(config.debugCollaboratorId) : 'global') : 'off'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'off') {
                      setDebugMutation.mutate({ id: config.id, debugMode: false, debugCollaboratorId: null });
                    } else if (val === 'global') {
                      setDebugMutation.mutate({ id: config.id, debugMode: true, debugCollaboratorId: null });
                    } else {
                      setDebugMutation.mutate({ id: config.id, debugMode: true, debugCollaboratorId: Number(val) });
                    }
                  }}
                  disabled={setDebugMutation.isPending}
                  style={{
                    padding: '5px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${config.debugMode ? '#6366f1' : '#d1d5db'}`,
                    background: config.debugMode ? '#eef2ff' : 'white',
                    color: config.debugMode ? '#4338ca' : '#6b7280',
                    fontWeight: 600, maxWidth: 200,
                  }}
                  title="Mode debug : capture les requetes SQL lors du prochain recalcul"
                >
                  <option value="off">Debug: OFF</option>
                  <option value="global">Debug: Global</option>
                  {(clientCollaborators ?? []).map((c: Collaborator) => (
                    <option key={c.id} value={c.id}>
                      Debug: {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
                {config.debugMode && (
                  <button
                    onClick={() => setViewingDebugConfigId(config.id)}
                    style={{
                      padding: '5px 12px', border: '1px solid #6366f1', borderRadius: 6,
                      background: '#4f46e5', cursor: 'pointer', fontSize: 12, color: 'white', fontWeight: 600,
                    }}
                  >
                    Voir traces
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Supprimer "${config.kpiDefinition?.name ?? 'ce KPI'}" de ce client ? Les resultats associes seront egalement supprimes.`)) {
                      removeMutation.mutate(config.id);
                    }
                  }}
                  disabled={removeMutation.isPending}
                  style={{
                    padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 6,
                    background: '#fef2f2', cursor: 'pointer', fontSize: 12, color: '#b91c1c', fontWeight: 600,
                    marginLeft: 'auto',
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── KPIs disponibles (non assignes) ── */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>
            KPIs disponibles
          </h3>
          {unassignedDefs.length > 0 && (
            <button
              onClick={handleAssignAll}
              disabled={assigningAll}
              style={{
                padding: '5px 14px', background: assigningAll ? '#93c5fd' : '#4f94ef', color: 'white',
                border: 'none', borderRadius: 6, cursor: assigningAll ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {assigningAll ? 'Ajout en cours...' : `Ajouter tous les KPIs (${unassignedDefs.length})`}
            </button>
          )}
        </div>

        {unassignedDefs.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>
            Tous les KPIs du catalogue sont deja assignes a ce client.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {unassignedDefs.map((def) => (
            <div key={def.id} style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
                  {def.name}
                  {def.isSystem && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#4f94ef', fontWeight: 400 }}>systeme</span>
                  )}
                </div>
                {def.description && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{def.description}</div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {def.formulaType}{def.unit ? ` · ${def.unit}` : ''}
                </div>
              </div>
              <button
                onClick={() => assignMutation.mutate(def.id)}
                disabled={assignMutation.isPending}
                style={{
                  padding: '5px 14px', background: '#4f94ef', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                Ajouter
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Modal seuils */}
      {editingConfig && (
        <ThresholdModal config={editingConfig} onClose={() => setEditingConfig(null)} />
      )}

      {/* Modal formule personnalisee */}
      {editingFormulaConfigId && configs && (
        <FormulaOverrideModal
          config={configs.find((c) => c.id === editingFormulaConfigId)!}
          clientId={clientId}
          onClose={() => setEditingFormulaConfigId(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['kpi-configs', clientId] }); setEditingFormulaConfigId(null); }}
        />
      )}

      {/* Modal traces debug */}
      {viewingDebugConfigId && configs && (
        <DebugTracesModal
          config={configs.find((c) => c.id === viewingDebugConfigId)!}
          onClose={() => setViewingDebugConfigId(null)}
        />
      )}
    </div>
  );
}

// ── Modal formule personnalisee par client ──

function FormulaOverrideModal({ config, clientId, onClose, onSaved }: {
  config: KpiClientConfig;
  clientId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Pre-remplir avec l'override existant, sinon la formule globale de la definition
  const existingOverride = (config as unknown as { formulaAstOverride: FormulaAst | null }).formulaAstOverride;
  const globalAst = (config.kpiDefinition as unknown as { formulaAst: FormulaAst | null })?.formulaAst;
  const initialAst = existingOverride ?? globalAst ?? null;

  const [formulaAst, setFormulaAst] = useState<FormulaAst | null>(initialAst);

  const saveMutation = useMutation({
    mutationFn: () => kpiApi.updateConfig(config.id, {
      formulaAstOverride: formulaAst,
    } as Partial<KpiClientConfig>),
    onSuccess: onSaved,
  });

  const resetMutation = useMutation({
    mutationFn: () => kpiApi.updateConfig(config.id, {
      formulaAstOverride: null,
    } as Partial<KpiClientConfig>),
    onSuccess: onSaved,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 900, maxWidth: '95vw', maxHeight: '95vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Formule personnalisee — {config.kpiDefinition?.name}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              {existingOverride
                ? 'Ce client utilise une formule personnalisee. Vous pouvez la modifier ou revenir a la formule par defaut.'
                : 'La formule par defaut de la definition est utilisee. Personnalisez-la pour ce client.'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {existingOverride && (
          <div style={{ marginBottom: 12, padding: 8, background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ce client a une formule personnalisee.</span>
            <button
              onClick={() => { if (confirm('Revenir a la formule par defaut ?')) resetMutation.mutate(); }}
              disabled={resetMutation.isPending}
              style={{ padding: '3px 10px', background: 'white', border: '1px solid #d97706', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#92400e' }}
            >
              Revenir au defaut
            </button>
          </div>
        )}

        <FormulaEditor value={formulaAst} onChange={setFormulaAst} clientId={clientId} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{ padding: '7px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer pour ce client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal traces debug ──────────────────────────────────────────────────────

function DebugTracesModal({ config, onClose }: { config: KpiClientConfig; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [expandedTraceId, setExpandedTraceId] = useState<number | null>(null);

  const { data: traces, isLoading } = useQuery({
    queryKey: ['kpi-debug-traces', config.id],
    queryFn: () => kpiApi.getDebugTraces(config.id),
  });

  const purgeMutation = useMutation({
    mutationFn: () => kpiApi.deleteDebugTraces(config.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-debug-traces', config.id] }),
  });

  // Grouper par période
  const tracesByPeriod = (traces ?? []).reduce<Record<string, KpiDebugTrace[]>>((acc, t) => {
    const key = t.periodStart.slice(0, 7);
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  const periods = Object.keys(tracesByPeriod).sort().reverse();

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 960, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Traces debug — {config.kpiDefinition?.name}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              Requetes SQL et metriques intermediaires des derniers calculs
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => { if (confirm('Purger toutes les traces debug ?')) purgeMutation.mutate(); }}
              disabled={purgeMutation.isPending}
              style={{ padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}
            >
              Purger
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'x'}</button>
          </div>
        </div>

        {isLoading && <div style={{ color: '#6b7280', fontSize: 13, padding: 20 }}>Chargement...</div>}

        {!isLoading && (!traces || traces.length === 0) && (
          <div style={{ padding: '32px 16px', border: '2px dashed #e5e7eb', borderRadius: 8, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Aucune trace debug disponible. Lancez un recalcul avec le mode debug actif.
          </div>
        )}

        {periods.map((period) => (
          <div key={period} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 8px', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>
              Periode : {period}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tracesByPeriod[period].map((trace) => {
                const isExpanded = expandedTraceId === trace.id;
                return (
                  <div key={trace.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Header cliquable */}
                    <div
                      onClick={() => setExpandedTraceId(isExpanded ? null : trace.id)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: trace.collaboratorId === null ? '#f0f9ff' : '#f9fafb',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
                          {trace.collaboratorId === null ? 'Global' : (trace.collaboratorName ?? `Collab #${trace.collaboratorId}`)}
                        </span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          Resultat : <strong>{trace.result !== null ? `${trace.result}` : 'null'}</strong>
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {trace.ticketCount} ticket{trace.ticketCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(trace.computedAt).toLocaleString('fr-FR')}
                      </span>
                    </div>

                    {/* Contenu deploye */}
                    {isExpanded && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb' }}>
                        {/* Formule */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Formule</div>
                          <code style={{ fontSize: 12, color: '#4338ca', background: '#eef2ff', padding: '4px 8px', borderRadius: 4 }}>
                            {trace.formulaSteps}
                          </code>
                        </div>

                        {/* Filtres */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Filtres appliques</div>
                          <pre style={{ fontSize: 11, color: '#374151', background: '#f9fafb', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 120, margin: 0 }}>
                            {JSON.stringify(trace.filtersApplied, null, 2)}
                          </pre>
                        </div>

                        {/* Metriques */}
                        {trace.metrics.map((m, idx) => (
                          <div key={idx} style={{ marginBottom: 10, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{m.metric}</span>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <span style={{ fontSize: 11, color: '#6b7280' }}>Lignes : {m.rowCount ?? '—'}</span>
                                <span style={{ fontSize: 11, color: '#6b7280' }}>Duree : {m.duration_ms}ms</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>
                                  Valeur : {m.aggregatedValue !== null ? m.aggregatedValue : 'null'}
                                </span>
                              </div>
                            </div>
                            {m.queries.map((q, qIdx) => (
                              <pre key={qIdx} style={{
                                margin: 0, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace',
                                color: '#1e293b', background: '#fefce8', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                borderTop: '1px solid #e5e7eb',
                              }}>
                                {q.sql}
                              </pre>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
