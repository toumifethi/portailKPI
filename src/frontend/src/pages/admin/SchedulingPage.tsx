import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi, importSchedulesApi, kpiCalcSchedulesApi, importsApi, kpiApi, jobLogsApi } from '@/api/endpoints';
import type { ImportSchedule, KpiCalcSchedule, Client, JobLog } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Quotidien (6h)', cron: '0 6 * * *' },
  { label: 'Lundi 6h', cron: '0 6 * * 1' },
  { label: 'Premier du mois (6h)', cron: '0 6 1 * *' },
];

const IMPORT_PERIOD_MODES = [
  { value: '1_week', label: '1 semaine glissante' },
  { value: '1_month', label: '1 mois glissant' },
  { value: '3_months', label: '3 mois glissants' },
  { value: '1_year', label: '1 an glissant' },
];

const KPI_PERIOD_MODES = [
  { value: 'current_month', label: 'Mois en cours' },
  { value: 'previous_month', label: 'Mois precedent' },
  { value: 'last_3_months', label: '3 derniers mois' },
  { value: 'all', label: 'Toutes les periodes (13 mois)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function cronToLabel(cron: string): string {
  const preset = CRON_PRESETS.find((p) => p.cron === cron);
  return preset ? preset.label : cron;
}

function resolveImportPeriod(periodMode: string): { start: string; end: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.toISOString().slice(0, 10);
  const start = new Date(tomorrow);
  switch (periodMode) {
    case '1_week': start.setDate(start.getDate() - 7); break;
    case '1_month': start.setDate(start.getDate() - 30); break;
    case '3_months': start.setDate(start.getDate() - 90); break;
    case '1_year': start.setDate(start.getDate() - 365); break;
  }
  return { start: start.toISOString().slice(0, 10), end };
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditScheduleModal({
  cronExpression: initialCron,
  periodMode: initialPeriodMode,
  periodModes,
  clientId: initialClientId,
  clients,
  kpiDefinitionId: initialKpiDefId,
  kpiDefinitions,
  allClients: initialAllClients,
  showAllClients,
  onClose,
  onSave,
  saving,
}: {
  cronExpression: string;
  periodMode: string;
  periodModes: { value: string; label: string }[];
  clientId?: number | null;
  clients?: Client[];
  kpiDefinitionId?: number | null;
  kpiDefinitions?: Array<{ id: number; name: string }>;
  allClients?: boolean;
  showAllClients?: boolean;
  onClose: () => void;
  onSave: (data: { cronExpression: string; periodMode: string; clientId?: number; kpiDefinitionId?: number; allClients?: boolean }) => void;
  saving: boolean;
}) {
  const [cronExpression, setCronExpression] = useState(initialCron);
  const [periodMode, setPeriodMode] = useState(initialPeriodMode);
  const [clientId, setClientId] = useState<number | undefined>(initialClientId ?? undefined);
  const [kpiDefinitionId, setKpiDefinitionId] = useState<number | undefined>(initialKpiDefId ?? undefined);
  const [isAllClients, setIsAllClients] = useState(initialAllClients ?? false);
  const isCustomCron = !CRON_PRESETS.some((p) => p.cron === cronExpression);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Modifier la planification</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Client */}
          {clients && (
            <div>
              <label style={editLabelStyle}>Client</label>
              {showAllClients && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 6 }}>
                  <input type="checkbox" checked={isAllClients} onChange={(e) => setIsAllClients(e.target.checked)} />
                  Tous les clients
                </label>
              )}
              {!isAllClients && (
                <select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : undefined)}
                  style={editSelectStyle}>
                  <option value="">-- Selectionner --</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* KPI (only for KPI calc) */}
          {kpiDefinitions && (
            <div>
              <label style={editLabelStyle}>KPI</label>
              <select value={kpiDefinitionId ?? ''} onChange={(e) => setKpiDefinitionId(e.target.value ? Number(e.target.value) : undefined)}
                style={editSelectStyle}>
                <option value="">Tous les KPIs actifs</option>
                {kpiDefinitions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {/* Cron presets */}
          <div>
            <label style={editLabelStyle}>Frequence (cron)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {CRON_PRESETS.map((p) => (
                <label key={p.cron} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="editCron" checked={cronExpression === p.cron}
                    onChange={() => setCronExpression(p.cron)} style={{ accentColor: '#4f94ef' }} />
                  {p.label} <span style={{ color: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }}>({p.cron})</span>
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="radio" name="editCron" checked={isCustomCron}
                  onChange={() => {}} style={{ accentColor: '#4f94ef' }} />
                Personnalise :
                <input value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  style={{ padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', width: 130 }} />
              </label>
            </div>
          </div>

          {/* Period mode */}
          <div>
            <label style={editLabelStyle}>Periode</label>
            <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)}
              style={editSelectStyle}>
              {periodModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '6px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              Annuler
            </button>
            <button
              onClick={() => onSave({ cronExpression, periodMode, clientId: isAllClients ? undefined : clientId, kpiDefinitionId, allClients: isAllClients || undefined })}
              disabled={saving}
              style={{ padding: '6px 14px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const editLabelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 };
const editSelectStyle: React.CSSProperties = { padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%' };

// ── Schedule Line ─────────────────────────────────────────────────────────────

function ScheduleLine({
  isActive,
  clientName,
  kpiName,
  cronExpression,
  periodModeLabel,
  nextRunAt,
  lastRunAt,
  onRunNow,
  runningNow,
  onEdit,
  onToggle,
  onDelete,
}: {
  isActive: boolean;
  clientName: string;
  kpiName?: string | null;
  cronExpression: string;
  periodModeLabel: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  onRunNow: () => void;
  runningNow: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: 6,
      background: isActive ? '#f0fdf4' : '#f9fafb',
      border: `1px solid ${isActive ? '#bbf7d0' : '#e5e7eb'}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? '#22c55e' : '#d1d5db', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{clientName}</span>
          {kpiName && (
            <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
              {kpiName}
            </span>
          )}
          {!kpiName && kpiName !== undefined && (
            <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#f3f4f6', color: '#6b7280' }}>
              Tous les KPIs
            </span>
          )}
          <span style={{ fontSize: 12, color: '#374151' }}>{cronToLabel(cronExpression)}</span>
          <span style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }}>({cronExpression})</span>
          <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#ede9fe', color: '#5b21b6', fontWeight: 600 }}>
            {periodModeLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, marginTop: 2 }}>
          {nextRunAt && isActive && (
            <span style={{ color: '#059669' }}>Prochaine : {new Date(nextRunAt).toLocaleString('fr-FR')}</span>
          )}
          {lastRunAt && (
            <span style={{ color: '#9ca3af' }}>Derniere : {new Date(lastRunAt).toLocaleString('fr-FR')}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={onRunNow} disabled={runningNow}
          style={{
            padding: '3px 10px',
            background: runningNow ? '#fef3c7' : '#dbeafe',
            color: runningNow ? '#92400e' : '#1d4ed8',
            border: runningNow ? '1px solid #fde68a' : 'none',
            borderRadius: 4, cursor: runningNow ? 'not-allowed' : 'pointer',
            fontSize: 11, fontWeight: 600,
            minWidth: 110,
          }}>
          {runningNow ? 'En cours...' : 'Lancer maintenant'}
        </button>
        <button onClick={onEdit}
          style={{ padding: '3px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
          Modifier
        </button>
        <button onClick={onToggle}
          style={{ padding: '3px 8px', background: isActive ? '#fef3c7' : '#d1fae5', color: isActive ? '#92400e' : '#065f46', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          {isActive ? 'Pause' : 'Activer'}
        </button>
        <button onClick={onDelete}
          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}>
          {'×'}
        </button>
      </div>
    </div>
  );
}

// ── Grouped Schedule List ─────────────────────────────────────────────────────

function GroupedScheduleList<T extends { id: number; isActive: boolean }>({
  schedules,
  renderLine,
}: {
  schedules: T[];
  renderLine: (s: T) => React.ReactNode;
}) {
  const active = schedules.filter((s) => s.isActive);
  const paused = schedules.filter((s) => !s.isActive);

  if (schedules.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Aucune planification.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {active.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            Actives ({active.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {active.map((s) => <React.Fragment key={s.id}>{renderLine(s)}</React.Fragment>)}
          </div>
        </div>
      )}
      {paused.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db', display: 'inline-block' }} />
            En pause ({paused.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paused.map((s) => <React.Fragment key={s.id}>{renderLine(s)}</React.Fragment>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Form ───────────────────────────────────────────────────────────────

function CreateScheduleForm({
  clients,
  periodModes,
  clientRequired,
  showAllClientsCheckbox,
  kpiDefinitions,
  onSubmit,
  creating,
  onCancel,
}: {
  clients: Client[];
  periodModes: { value: string; label: string }[];
  clientRequired: boolean;
  showAllClientsCheckbox: boolean;
  kpiDefinitions?: Array<{ id: number; name: string }>;
  onSubmit: (data: { clientId?: number; kpiDefinitionId?: number; cronExpression: string; periodMode: string; allClients?: boolean }) => void;
  creating: boolean;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState<number | undefined>(clients[0]?.id);
  const [selectedCron, setSelectedCron] = useState(CRON_PRESETS[0].cron);
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [customCron, setCustomCron] = useState('');
  const [periodMode, setPeriodMode] = useState(periodModes[0].value);
  const [allClients, setAllClients] = useState(false);
  const [kpiDefinitionId, setKpiDefinitionId] = useState<number | undefined>(undefined);

  const cron = useCustomCron ? customCron : selectedCron;
  const canSubmit = cron.trim() && (showAllClientsCheckbox ? (allClients || clientId) : clientId);

  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0369a1' }}>Nouvelle planification</div>

      {/* Client */}
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Client</label>
        {showAllClientsCheckbox && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginBottom: 6 }}>
            <input type="checkbox" checked={allClients} onChange={(e) => setAllClients(e.target.checked)} />
            Tous les clients
          </label>
        )}
        {(!showAllClientsCheckbox || !allClients) && (
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : undefined)}
            style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%' }}
          >
            {!clientRequired && <option value="">-- Aucun client --</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Cron */}
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Frequence</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {CRON_PRESETS.map((p) => (
            <label key={p.cron} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="createCron" checked={!useCustomCron && selectedCron === p.cron}
                onChange={() => { setSelectedCron(p.cron); setUseCustomCron(false); }} style={{ accentColor: '#4f94ef' }} />
              {p.label} <span style={{ color: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }}>({p.cron})</span>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="createCron" checked={useCustomCron}
              onChange={() => setUseCustomCron(true)} style={{ accentColor: '#4f94ef' }} />
            Personnalise
          </label>
        </div>
        {useCustomCron && (
          <input value={customCron} onChange={(e) => setCustomCron(e.target.value)}
            placeholder="ex: 30 2 * * 1-5"
            style={{ marginTop: 4, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', width: '100%', boxSizing: 'border-box' }} />
        )}
      </div>

      {/* Period mode */}
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Periode</label>
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%' }}>
          {periodModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* KPI selector (optional) */}
      {kpiDefinitions && (
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>KPI</label>
          <select value={kpiDefinitionId ?? ''} onChange={(e) => setKpiDefinitionId(e.target.value ? Number(e.target.value) : undefined)}
            style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, width: '100%' }}>
            <option value="">Tous les KPIs actifs</option>
            {kpiDefinitions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onSubmit({ clientId: allClients ? undefined : clientId, kpiDefinitionId, cronExpression: cron, periodMode, allClients: allClients || undefined })}
          disabled={creating || !canSubmit}
          style={{ padding: '5px 14px', background: canSubmit && !creating ? '#4f94ef' : '#93c5fd', color: 'white', border: 'none', borderRadius: 5, cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}
        >
          {creating ? 'Creation...' : 'Creer'}
        </button>
        <button onClick={onCancel}
          style={{ padding: '5px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Job Log History ────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m${remainSecs > 0 ? ` ${remainSecs}s` : ''}`;
}

function StatusBadge({ status }: { status: JobLog['status'] }) {
  const styles: Record<string, React.CSSProperties> = {
    COMPLETED: { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' },
    FAILED: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    RUNNING: { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
  };
  const labels: Record<string, string> = { COMPLETED: 'Termine', FAILED: 'Echoue', RUNNING: 'En cours' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', ...styles[status] }}>
      {labels[status] ?? status}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: JobLog['triggeredBy'] }) {
  const isManual = trigger === 'MANUAL';
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
      background: isManual ? '#fef3c7' : '#ede9fe',
      color: isManual ? '#92400e' : '#5b21b6',
    }}>
      {isManual ? 'Manuel' : 'Planifie'}
    </span>
  );
}

function JobLogHistory({ jobType }: { jobType: 'IMPORT' | 'KPI_CALC' }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['job-logs', jobType],
    queryFn: () => jobLogsApi.list({ jobType, limit: 20 }),
    refetchInterval: false,
  });

  const logs = data?.data ?? [];
  const hasRunning = logs.some((l) => l.status === 'RUNNING');

  // Auto-refresh every 5 seconds if any job is RUNNING
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(() => { refetch(); }, 5000);
    return () => clearInterval(interval);
  }, [hasRunning, refetch]);

  if (logs.length === 0) {
    return (
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Historique des executions</h3>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Aucune execution enregistree.</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>Historique des executions</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Statut</th>
              <th style={thStyle}>Demarre</th>
              <th style={thStyle}>Termine</th>
              <th style={thStyle}>Duree</th>
              {jobType === 'IMPORT' && <th style={thStyle}>Issues</th>}
              {jobType === 'IMPORT' && <th style={thStyle}>Worklogs</th>}
              {jobType !== 'IMPORT' && <th style={thStyle}>Items</th>}
              <th style={thStyle}>Erreurs</th>
              <th style={thStyle}>Declencheur</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const hasDetails = log.errorMessage || (log.metadata?.details && Array.isArray(log.metadata.details) && log.metadata.details.length > 0);
              const isExpanded = expandedId === log.id;
              const detailLines: string[] = [];
              if (log.metadata?.details && Array.isArray(log.metadata.details)) {
                for (const d of log.metadata.details) {
                  if (typeof d === 'string') {
                    detailLines.push(d);
                  } else if (typeof d === 'object' && d !== null) {
                    const obj = d as { kpiName?: string; status?: string; reason?: string; collaboratorsCount?: number; periodsCount?: number };
                    if (obj.status === 'ok') {
                      detailLines.push(`✓ ${obj.kpiName} : ${obj.collaboratorsCount} collaborateurs, ${obj.periodsCount} periodes`);
                    } else if (obj.status === 'skipped') {
                      detailLines.push(`⚠ ${obj.kpiName} : ${obj.reason}`);
                    } else if (obj.status === 'error') {
                      detailLines.push(`✗ ${obj.kpiName} : ${obj.reason}`);
                    }
                  }
                }
              }
              if (log.errorMessage && detailLines.length === 0) {
                detailLines.push(log.errorMessage);
              }
              const fullText = detailLines.join('\n');

              return (
              <React.Fragment key={log.id}>
                <tr
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    cursor: hasDetails ? 'pointer' : 'default',
                    background: isExpanded ? (log.status === 'FAILED' ? '#fef2f2' : '#f0fdf4') : undefined,
                  }}
                  onClick={() => {
                    if (hasDetails) setExpandedId(isExpanded ? null : log.id);
                  }}
                >
                  <td style={tdStyle}>#{log.id}</td>
                  <td style={tdStyle}>{log.client?.name ?? '-'}</td>
                  <td style={tdStyle}><StatusBadge status={log.status} /></td>
                  <td style={tdStyle}>{new Date(log.startedAt).toLocaleString('fr-FR')}</td>
                  <td style={tdStyle}>{log.completedAt ? new Date(log.completedAt).toLocaleString('fr-FR') : '—'}</td>
                  <td style={tdStyle}>{formatDuration(log.durationMs)}</td>
                  {jobType === 'IMPORT' && <td style={tdStyle}>{log.metadata?.issuesFetched ?? '—'}</td>}
                  {jobType === 'IMPORT' && <td style={tdStyle}>{log.metadata?.worklogsFetched ?? '—'}</td>}
                  {jobType !== 'IMPORT' && <td style={tdStyle}>{log.itemsProcessed}</td>}
                  <td style={tdStyle}>{log.errorCount > 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{log.errorCount}</span> : '0'}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TriggerBadge trigger={log.triggeredBy} />
                      {hasDetails && <span style={{ fontSize: 10, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>}
                    </div>
                  </td>
                </tr>
                {isExpanded && detailLines.length > 0 && (
                  <tr>
                    <td colSpan={jobType === 'IMPORT' ? 10 : 9} style={{
                      padding: '8px 12px',
                      background: log.status === 'FAILED' ? '#fef2f2' : '#f8fafc',
                      borderBottom: `1px solid ${log.status === 'FAILED' ? '#fca5a5' : '#e2e8f0'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', flex: 1 }}>
                          {detailLines.map((line, i) => (
                            <div key={i} style={{
                              color: line.startsWith('✗') ? '#991b1b' : line.startsWith('⚠') ? '#92400e' : '#374151',
                              padding: '1px 0',
                            }}>
                              {line}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fullText); }}
                          title="Copier"
                          style={{
                            padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db',
                            borderRadius: 4, cursor: 'pointer', fontSize: 13, marginLeft: 8, flexShrink: 0,
                          }}
                        >
                          📋
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '6px 10px', fontWeight: 600, color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };

// ── Imports Tab ────────────────────────────────────────────────────────────────

function ImportsTab({ clients }: { clients: Client[] }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ImportSchedule | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: schedules = [] } = useQuery({
    queryKey: ['import-schedules'],
    queryFn: () => importSchedulesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: async (data: { clientId?: number; cronExpression: string; periodMode: string; allClients?: boolean }) => {
      if (data.allClients) {
        // Creer une planification pour chaque client actif
        for (const c of clients) {
          await importSchedulesApi.create({ clientId: c.id, cronExpression: data.cronExpression, periodMode: data.periodMode });
        }
      } else {
        await importSchedulesApi.create({ clientId: data.clientId!, cronExpression: data.cronExpression, periodMode: data.periodMode });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['import-schedules'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { cronExpression?: string; isActive?: boolean; periodMode?: string } }) =>
      importSchedulesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['import-schedules'] }); setEditingSchedule(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => importSchedulesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-schedules'] }),
  });

  const triggerMutation = useMutation({
    mutationFn: ({ clientId, periodStart, periodEnd }: { clientId: number; periodStart: string; periodEnd: string }) =>
      importsApi.trigger(clientId, periodStart, periodEnd),
    onSuccess: () => { setRunningId(null); queryClient.invalidateQueries({ queryKey: ['job-logs'] }); },
    onError: () => { setRunningId(null); queryClient.invalidateQueries({ queryKey: ['job-logs'] }); },
  });

  function handleRunNow(s: ImportSchedule) {
    if (!s.clientId) return;
    setRunningId(s.id);
    const { start, end } = resolveImportPeriod(s.periodMode);
    triggerMutation.mutate({ clientId: s.clientId, periodStart: start, periodEnd: end });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>Planification des imports</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: '5px 14px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Planifier
          </button>
        )}
      </div>

      {showForm && (
        <CreateScheduleForm
          clients={clients}
          periodModes={IMPORT_PERIOD_MODES}
          clientRequired={true}
          showAllClientsCheckbox={true}
          onSubmit={(data) => createMutation.mutate({ clientId: data.allClients ? undefined : data.clientId, cronExpression: data.cronExpression, periodMode: data.periodMode, allClients: data.allClients })}
          creating={createMutation.isPending}
          onCancel={() => setShowForm(false)}
        />
      )}

      <GroupedScheduleList
        schedules={schedules}
        renderLine={(s) => (
          <ScheduleLine
            isActive={s.isActive}
            clientName={s.client?.name ?? 'Client #' + s.clientId}
            cronExpression={s.cronExpression}
            periodModeLabel={IMPORT_PERIOD_MODES.find((m) => m.value === s.periodMode)?.label ?? s.periodMode}
            nextRunAt={s.nextRunAt}
            lastRunAt={s.lastRunAt}
            onRunNow={() => handleRunNow(s)}
            runningNow={runningId === s.id}
            onEdit={() => setEditingSchedule(s)}
            onToggle={() => updateMutation.mutate({ id: s.id, data: { isActive: !s.isActive } })}
            onDelete={() => deleteMutation.mutate(s.id)}
          />
        )}
      />

      {editingSchedule && (
        <EditScheduleModal
          cronExpression={editingSchedule.cronExpression}
          periodMode={editingSchedule.periodMode}
          periodModes={IMPORT_PERIOD_MODES}
          clientId={editingSchedule.clientId}
          clients={clients}
          showAllClients={true}
          onClose={() => setEditingSchedule(null)}
          onSave={(data) => updateMutation.mutate({ id: editingSchedule.id, data: { cronExpression: data.cronExpression, periodMode: data.periodMode } })}
          saving={updateMutation.isPending}
        />
      )}

      <JobLogHistory jobType="IMPORT" />
    </div>
  );
}

// ── KPI Calc Tab ──────────────────────────────────────────────────────────────

function KpiCalcTab({ clients }: { clients: Client[] }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<KpiCalcSchedule | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: schedules = [] } = useQuery({
    queryKey: ['kpi-calc-schedules'],
    queryFn: () => kpiCalcSchedulesApi.list(),
  });

  const { data: kpiDefinitions = [] } = useQuery({
    queryKey: ['kpi-definitions'],
    queryFn: () => kpiApi.getDefinitions(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { clientId?: number; kpiDefinitionId?: number; cronExpression: string; periodMode: string; allClients?: boolean }) =>
      kpiCalcSchedulesApi.create({ clientId: data.clientId, kpiDefinitionId: data.kpiDefinitionId, cronExpression: data.cronExpression, periodMode: data.periodMode, allClients: data.allClients }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kpi-calc-schedules'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { cronExpression?: string; isActive?: boolean; periodMode?: string; allClients?: boolean; kpiDefinitionId?: number } }) =>
      kpiCalcSchedulesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kpi-calc-schedules'] }); setEditingSchedule(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => kpiCalcSchedulesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpi-calc-schedules'] }),
  });

  const recalcMutation = useMutation({
    mutationFn: (params: { clientId?: number; period?: string; allClients?: boolean }) =>
      kpiApi.recalculate(params),
    onSuccess: () => { setRunningId(null); queryClient.invalidateQueries({ queryKey: ['job-logs'] }); },
    onError: () => { setRunningId(null); queryClient.invalidateQueries({ queryKey: ['job-logs'] }); },
  });

  function handleRecalcNow(s: KpiCalcSchedule) {
    setRunningId(s.id);
    // Resolve period from periodMode for immediate recalculation
    let period: string | undefined;
    const now = new Date();
    switch (s.periodMode) {
      case 'current_month':
        period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'previous_month': {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'last_3_months':
      case 'all':
        period = undefined; // recalculate all
        break;
    }
    recalcMutation.mutate({
      clientId: s.allClients ? undefined : (s.clientId ?? undefined),
      period,
      allClients: s.allClients || undefined,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>Planification du calcul KPI</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ padding: '5px 14px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Planifier
          </button>
        )}
      </div>

      {showForm && (
        <CreateScheduleForm
          clients={clients}
          periodModes={KPI_PERIOD_MODES}
          clientRequired={false}
          showAllClientsCheckbox={true}
          kpiDefinitions={kpiDefinitions.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
          onSubmit={(data) => createMutation.mutate(data)}
          creating={createMutation.isPending}
          onCancel={() => setShowForm(false)}
        />
      )}

      <GroupedScheduleList
        schedules={schedules}
        renderLine={(s) => (
          <ScheduleLine
            isActive={s.isActive}
            clientName={s.allClients ? 'Tous les clients' : (s.client?.name ?? 'Client #' + s.clientId)}
            kpiName={s.kpiDefinition?.name ?? null}
            cronExpression={s.cronExpression}
            periodModeLabel={KPI_PERIOD_MODES.find((m) => m.value === s.periodMode)?.label ?? s.periodMode}
            nextRunAt={s.nextRunAt}
            lastRunAt={s.lastRunAt}
            onRunNow={() => handleRecalcNow(s)}
            runningNow={runningId === s.id}
            onEdit={() => setEditingSchedule(s)}
            onToggle={() => updateMutation.mutate({ id: s.id, data: { isActive: !s.isActive } })}
            onDelete={() => deleteMutation.mutate(s.id)}
          />
        )}
      />

      {editingSchedule && (
        <EditScheduleModal
          cronExpression={editingSchedule.cronExpression}
          periodMode={editingSchedule.periodMode}
          periodModes={KPI_PERIOD_MODES}
          clientId={editingSchedule.clientId}
          clients={clients}
          allClients={editingSchedule.allClients}
          showAllClients={true}
          kpiDefinitionId={editingSchedule.kpiDefinitionId}
          kpiDefinitions={kpiDefinitions.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
          onClose={() => setEditingSchedule(null)}
          onSave={(data) => updateMutation.mutate({ id: editingSchedule.id, data: { cronExpression: data.cronExpression, periodMode: data.periodMode, allClients: data.allClients, kpiDefinitionId: data.kpiDefinitionId } })}
          saving={updateMutation.isPending}
        />
      )}

      <JobLogHistory jobType="KPI_CALC" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const [activeTab, setActiveTab] = useState<'imports' | 'kpi'>('imports');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  });

  const tabs = [
    { key: 'imports' as const, label: 'Imports' },
    { key: 'kpi' as const, label: 'Calcul KPI' },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
          Planification
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Gerez les planifications automatiques des imports et du calcul KPI.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 24px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #4f94ef' : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === tab.key ? '#1d4ed8' : '#6b7280',
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'imports' && <ImportsTab clients={clients} />}
      {activeTab === 'kpi' && <KpiCalcTab clients={clients} />}
    </div>
  );
}
