import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpiApi, profilesApi } from '@/api/endpoints';
import type { KpiDefinition, FormulaAst } from '@/types';
import { FormulaEditor } from '@/components/shared/FormulaEditor';
import { SqlHighlightEditor } from '@/components/shared/SqlHighlightEditor';

// ── Types locaux ─────────────────────────────────────────────────────────────

interface ThresholdForm {
  redMin: string; redMax: string;
  orangeMin: string; orangeMax: string;
  greenMin: string; greenMax: string;
}

const EMPTY_THRESHOLD: ThresholdForm = {
  redMin: '', redMax: '',
  orangeMin: '', orangeMax: '',
  greenMin: '', greenMax: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

function fromNum(n: number | null | undefined): string {
  return n == null ? '' : String(n);
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
        {(minVal || maxVal) ? `→ ${[minVal ? `≥ ${minVal}` : null, maxVal ? `≤ ${maxVal}` : null].filter(Boolean).join(' et ')}` : 'non configuré'}
      </span>
    </div>
  );
}

// ── Sélecteur de profils cibles ────────────────────────────────────────────────

function ProfileSelector({ selected, onChange }: { selected: Set<number>; onChange: (s: Set<number>) => void }) {
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list });

  function toggle(profileId: number) {
    const next = new Set(selected);
    if (next.has(profileId)) next.delete(profileId); else next.add(profileId);
    onChange(next);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
        Profils cibles
      </label>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9ca3af' }}>
        {selected.size === 0
          ? 'Aucun profil selectionne = visible par tous les profils.'
          : 'Seuls les profils coches verront ce KPI sur le dashboard.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(profiles ?? []).filter((p) => p.isActive).map((p) => {
          const checked = selected.has(p.id);
          return (
            <label key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer',
              padding: '3px 10px', borderRadius: 5,
              background: checked ? '#eef2ff' : '#f9fafb',
              border: checked ? '2px solid #4f46e5' : '1px solid #e5e7eb',
              color: checked ? '#4f46e5' : '#6b7280',
              fontWeight: checked ? 600 : 400,
            }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)}
                style={{ accentColor: '#4f46e5', width: 13, height: 13 }} />
              {p.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal édition KPI ─────────────────────────────────────────────────────────

function EditKpiModal({ def, onClose }: { def: KpiDefinition; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(def.name);
  const [description, setDescription] = useState(def.description ?? '');
  const [unit, setUnit] = useState(def.unit ?? '');
  const [formulaType, setFormulaType] = useState<'FORMULA_AST' | 'SQL'>(
    def.formulaType as 'FORMULA_AST' | 'SQL',
  );
  const [formulaAst, setFormulaAst] = useState<FormulaAst | null>(
    (def as unknown as { formulaAst: FormulaAst | null }).formulaAst ?? null,
  );
  const defAny = def as unknown as Record<string, unknown>;
  const baseConfig = (defAny.baseConfig ?? {}) as Record<string, unknown>;
  const [sqlQuery, setSqlQuery] = useState((baseConfig.sql as string) ?? '');
  const existingTargetIds = ((defAny.targetProfiles as Array<{ profileId: number }>) ?? []).map((tp) => tp.profileId);
  const [targetProfileIds, setTargetProfileIds] = useState<Set<number>>(new Set(existingTargetIds));
  const [thresholds, setThresholds] = useState<ThresholdForm>({
    redMin: fromNum(defAny.defaultThresholdRedMin as number | null),
    redMax: fromNum(defAny.defaultThresholdRedMax as number | null),
    orangeMin: fromNum(defAny.defaultThresholdOrangeMin as number | null),
    orangeMax: fromNum(defAny.defaultThresholdOrangeMax as number | null),
    greenMin: fromNum(defAny.defaultThresholdGreenMin as number | null),
    greenMax: fromNum(defAny.defaultThresholdGreenMax as number | null),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      kpiApi.updateDefinition(def.id, {
        name,
        description: description || undefined,
        unit: unit || undefined,
        formulaType,
        ...(formulaType === 'FORMULA_AST' && formulaAst ? { formulaAst: formulaAst as unknown as Record<string, unknown> } : {}),
        ...(formulaType === 'SQL' ? { baseConfig: { sql: sqlQuery } } : {}),
        targetProfileIds: [...targetProfileIds],
        defaultThresholdRedMin: toNum(thresholds.redMin),
        defaultThresholdRedMax: toNum(thresholds.redMax),
        defaultThresholdOrangeMin: toNum(thresholds.orangeMin),
        defaultThresholdOrangeMax: toNum(thresholds.orangeMax),
        defaultThresholdGreenMin: toNum(thresholds.greenMin),
        defaultThresholdGreenMax: toNum(thresholds.greenMax),
      } as Partial<KpiDefinition>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-configs'] });
      onClose();
    },
  });

  const modalInputStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '7px 10px',
    border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
  };

  const isAst = formulaType === 'FORMULA_AST';
  const isSql = formulaType === 'SQL';
  const [modalTab, setModalTab] = useState<'general' | 'expression' | 'sql' | 'profils'>('general');

  const MODAL_TABS = [
    { id: 'general' as const, label: 'General' },
    ...(isAst ? [
      { id: 'expression' as const, label: 'Expression' },
    ] : []),
    ...(isSql ? [{ id: 'sql' as const, label: 'Requete SQL' }] : []),
    { id: 'profils' as const, label: 'Profils & Seuils' },
  ];

  // Quand on change le type, revenir a l'onglet General
  const handleFormulaTypeChange = (newType: 'FORMULA_AST' | 'SQL') => {
    setFormulaType(newType);
    setModalTab('general');
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 28, width: 900, maxWidth: '95vw', margin: '40px auto', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Modifier le KPI</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>
        {def.isSystem && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#d97706', background: '#fffbeb', padding: '6px 10px', borderRadius: 6 }}>
            KPI systeme — les modifications s'appliquent a tous les clients.
          </p>
        )}

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
          {MODAL_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setModalTab(tab.id)}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none',
                borderBottom: modalTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -2, background: 'transparent',
                color: modalTab === tab.id ? '#4f46e5' : '#6b7280', cursor: 'pointer',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div>

        {/* Onglet General */}
        {modalTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} style={modalInputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Description</label>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                style={{ ...modalInputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Unite</label>
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
                placeholder="%, h, pts…" style={modalInputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Type de formule</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleFormulaTypeChange('FORMULA_AST')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: isAst ? '2px solid #4f46e5' : '1px solid #d1d5db',
                    background: isAst ? '#eef2ff' : 'white',
                    color: isAst ? '#4f46e5' : '#6b7280',
                  }}>
                  Formule guidee
                </button>
                <button onClick={() => handleFormulaTypeChange('SQL')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: isSql ? '2px solid #4f46e5' : '1px solid #d1d5db',
                    background: isSql ? '#eef2ff' : 'white',
                    color: isSql ? '#4f46e5' : '#6b7280',
                  }}>
                  SQL brut
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Onglets Formule AST (3 sections) */}
        {modalTab === 'expression' && isAst && (
          <FormulaEditor value={formulaAst} onChange={setFormulaAst} section="expression" />
        )}

        {/* Onglet SQL */}
        {modalTab === 'sql' && isSql && (
          <SqlHighlightEditor value={sqlQuery} onChange={setSqlQuery} label="Requete SQL" />
        )}

        {/* Onglet Profils & Seuils */}
        {modalTab === 'profils' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProfileSelector selected={targetProfileIds} onChange={setTargetProfileIds} />
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>Seuils par defaut (RAG)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <IntervalRow color="🔴" label="Rouge" bg="#fef2f2"
                  minVal={thresholds.redMin} maxVal={thresholds.redMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, redMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, redMax: v })} />
                <IntervalRow color="🟠" label="Orange" bg="#fffbeb"
                  minVal={thresholds.orangeMin} maxVal={thresholds.orangeMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, orangeMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, orangeMax: v })} />
                <IntervalRow color="🟢" label="Vert" bg="#f0fdf4"
                  minVal={thresholds.greenMin} maxVal={thresholds.greenMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, greenMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, greenMax: v })} />
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>
                Ces seuils seront copies dans les nouvelles assignations client.
              </p>
            </div>
          </div>
        )}

        </div>{/* fin contenu */}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb', position: 'sticky', bottom: 0, background: 'white', zIndex: 1 }}>
          <button onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={() => updateMutation.mutate()}
            disabled={!name || updateMutation.isPending}
            style={{
              padding: '7px 20px',
              background: name ? '#4f94ef' : '#e5e7eb',
              color: name ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 6,
              cursor: name ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}>
            {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal création KPI ────────────────────────────────────────────────────────

function CreateKpiModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [formulaType, setFormulaType] = useState<'FORMULA_AST' | 'SQL'>('FORMULA_AST');
  const [formulaAst, setFormulaAst] = useState<FormulaAst | null>(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [thresholds, setThresholds] = useState<ThresholdForm>(EMPTY_THRESHOLD);
  const [targetProfileIds, setTargetProfileIds] = useState<Set<number>>(new Set());

  const isAst = formulaType === 'FORMULA_AST';
  const isSql = formulaType === 'SQL';
  const [modalTab, setModalTab] = useState<'general' | 'expression' | 'sql' | 'profils'>('general');

  const MODAL_TABS = [
    { id: 'general' as const, label: 'General' },
    ...(isAst ? [
      { id: 'expression' as const, label: 'Expression' },
    ] : []),
    ...(isSql ? [{ id: 'sql' as const, label: 'Requete SQL' }] : []),
    { id: 'profils' as const, label: 'Profils & Seuils' },
  ];

  const handleFormulaTypeChange = (newType: 'FORMULA_AST' | 'SQL') => {
    setFormulaType(newType);
    setModalTab('general');
  };

  const createMutation = useMutation({
    mutationFn: () => kpiApi.createDefinition({
      name,
      description: description || undefined,
      unit: unit || undefined,
      formulaType,
      baseConfig: formulaType === 'SQL' ? { sql: sqlQuery } : {},
      ...(formulaType === 'FORMULA_AST' && formulaAst ? { formulaAst: formulaAst as unknown as Record<string, unknown> } : {}),
      targetProfileIds: targetProfileIds.size > 0 ? [...targetProfileIds] : undefined,
      defaultThresholdRedMin: toNum(thresholds.redMin),
      defaultThresholdRedMax: toNum(thresholds.redMax),
      defaultThresholdOrangeMin: toNum(thresholds.orangeMin),
      defaultThresholdOrangeMax: toNum(thresholds.orangeMax),
      defaultThresholdGreenMin: toNum(thresholds.greenMin),
      defaultThresholdGreenMax: toNum(thresholds.greenMax),
    } as Parameters<typeof kpiApi.createDefinition>[0]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-definitions'] });
      onClose();
    },
  });

  const modalInputStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '7px 10px',
    border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 28, width: 900, maxWidth: '95vw', margin: '40px auto', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nouveau KPI</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
          {MODAL_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setModalTab(tab.id)}
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none',
                borderBottom: modalTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -2, background: 'transparent',
                color: modalTab === tab.id ? '#4f46e5' : '#6b7280', cursor: 'pointer',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div>

        {modalTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Taux de livraison" style={modalInputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Description</label>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Description optionnelle…"
                style={{ ...modalInputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Unite</label>
                <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
                  placeholder="%, h, pts…" style={modalInputStyle} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>Type de formule</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleFormulaTypeChange('FORMULA_AST')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: isAst ? '2px solid #4f46e5' : '1px solid #d1d5db',
                    background: isAst ? '#eef2ff' : 'white',
                    color: isAst ? '#4f46e5' : '#6b7280',
                  }}>
                  Formule guidee
                </button>
                <button onClick={() => handleFormulaTypeChange('SQL')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: isSql ? '2px solid #4f46e5' : '1px solid #d1d5db',
                    background: isSql ? '#eef2ff' : 'white',
                    color: isSql ? '#4f46e5' : '#6b7280',
                  }}>
                  SQL brut
                </button>
              </div>
            </div>
          </div>
        )}

        {modalTab === 'expression' && isAst && (
          <FormulaEditor value={formulaAst} onChange={setFormulaAst} section="expression" />
        )}

        {modalTab === 'sql' && isSql && (
          <SqlHighlightEditor value={sqlQuery} onChange={setSqlQuery} label="Requete SQL" />
        )}

        {modalTab === 'profils' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProfileSelector selected={targetProfileIds} onChange={setTargetProfileIds} />
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>Seuils par defaut (RAG)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <IntervalRow color="🔴" label="Rouge" bg="#fef2f2"
                  minVal={thresholds.redMin} maxVal={thresholds.redMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, redMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, redMax: v })} />
                <IntervalRow color="🟠" label="Orange" bg="#fffbeb"
                  minVal={thresholds.orangeMin} maxVal={thresholds.orangeMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, orangeMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, orangeMax: v })} />
                <IntervalRow color="🟢" label="Vert" bg="#f0fdf4"
                  minVal={thresholds.greenMin} maxVal={thresholds.greenMax}
                  onMinChange={(v) => setThresholds({ ...thresholds, greenMin: v })}
                  onMaxChange={(v) => setThresholds({ ...thresholds, greenMax: v })} />
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>
                Ces seuils seront copies automatiquement lors de l'assignation a un client.
              </p>
            </div>
          </div>
        )}

        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
          <button onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
            style={{
              padding: '7px 20px',
              background: name ? '#4f94ef' : '#e5e7eb',
              color: name ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 6,
              cursor: name ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}>
            {createMutation.isPending ? 'Creation…' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Badges seuils par defaut pour les definitions ────────────────────────────

function DefaultThresholdBadges({ def }: { def: KpiDefinition }) {
  const defAny = def as unknown as Record<string, unknown>;
  const badges: React.ReactNode[] = [];

  function badge(color: string, bg: string, label: string, min: unknown, max: unknown) {
    const minN = min != null ? Number(min) : null;
    const maxN = max != null ? Number(max) : null;
    if (minN == null && maxN == null) return;
    const range = [minN != null ? `>= ${minN}` : null, maxN != null ? `<= ${maxN}` : null]
      .filter(Boolean).join(' et ');
    badges.push(
      <span key={label} style={{ padding: '2px 8px', background: bg, color, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
        {label} {range}
      </span>
    );
  }

  badge('#991b1b', '#fee2e2', 'Rouge', defAny.defaultThresholdRedMin, defAny.defaultThresholdRedMax);
  badge('#92400e', '#fef3c7', 'Orange', defAny.defaultThresholdOrangeMin, defAny.defaultThresholdOrangeMax);
  badge('#065f46', '#d1fae5', 'Vert', defAny.defaultThresholdGreenMin, defAny.defaultThresholdGreenMax);

  return badges.length ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>
  ) : (
    <span style={{ fontSize: 11, color: '#9ca3af' }}>Aucun seuil par defaut</span>
  );
}

// ── Page principale — Catalogue des definitions KPI ───────────────────────────

export default function KpiConfigPage() {
  const queryClient = useQueryClient();
  const [editingDef, setEditingDef] = useState<KpiDefinition | null>(null);
  const [showCreateKpi, setShowCreateKpi] = useState(false);
  const { data: allDefinitions, isLoading: loadingDefs } = useQuery({
    queryKey: ['kpi-definitions'],
    queryFn: kpiApi.getDefinitions,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => kpiApi.deleteDefinition(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-definitions'] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => kpiApi.duplicateDefinition(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-definitions'] }),
  });

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
            Catalogue des KPIs
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Definitions globales des KPIs. Ces definitions sont partagees entre tous les clients.
          </p>
        </div>
        <button
          onClick={() => setShowCreateKpi(true)}
          style={{ padding: '8px 18px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          + Nouveau KPI
        </button>
      </div>

      {/* ── Section 1 : Catalogue des definitions ── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>
          Definitions
        </h2>

        {loadingDefs && <div style={{ color: '#6b7280', fontSize: 14 }}>Chargement…</div>}

        {!loadingDefs && !allDefinitions?.length && (
          <div style={{ padding: '32px 24px', border: '2px dashed #e5e7eb', borderRadius: 8, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Aucune definition KPI. Cliquez sur "+ Nouveau KPI" pour en creer une.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allDefinitions?.map((def) => {
            const defAny = def as unknown as Record<string, unknown>;
            const targetProfiles = (defAny.targetProfiles as Array<{ profile: { label: string } }>) ?? [];
            return (
              <div key={def.id} style={{
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                      {def.name}
                      {def.isSystem && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#4f94ef', fontWeight: 400 }}>systeme</span>
                      )}
                    </div>
                    {def.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {def.description}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {def.formulaType}
                      {def.unit && ` · unite : ${def.unit}`}
                    </div>
                    {/* Profils cibles */}
                    {targetProfiles.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Visible par tous les profils</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Profils :</span>
                        {targetProfiles.map((t, i) => (
                          <span key={i} style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#ede9fe', color: '#5b21b6', fontWeight: 600 }}>
                            {t.profile.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Seuils par defaut */}
                <DefaultThresholdBadges def={def} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setEditingDef(def)}
                    style={{
                      padding: '5px 12px', border: '1px solid #93c5fd', borderRadius: 6,
                      background: '#eff6ff', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', fontWeight: 600,
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => duplicateMutation.mutate(def.id)}
                    disabled={duplicateMutation.isPending}
                    style={{
                      padding: '5px 12px', border: '1px solid #a5d6a7', borderRadius: 6,
                      background: '#f1f8e9', cursor: 'pointer', fontSize: 12, color: '#2e7d32', fontWeight: 600,
                    }}
                  >
                    Dupliquer
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer la definition "${def.name}" ? Cette action supprimera egalement toutes les assignations client associees.`)) {
                        deleteMutation.mutate(def.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
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
            );
          })}
        </div>
      </section>

      {/* Modals */}
      {editingDef && (
        <EditKpiModal def={editingDef} onClose={() => setEditingDef(null)} />
      )}
      {showCreateKpi && (
        <CreateKpiModal onClose={() => setShowCreateKpi(false)} />
      )}
    </div>
  );
}
