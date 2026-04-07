import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi, maintenanceApi, settingsApi } from '@/api/endpoints';

const DATA_TYPES = [
  { key: 'worklogs', label: 'Worklogs', hint: 'startedAt < date seuil' },
  { key: 'issues', label: 'Issues', hint: 'jiraUpdatedAt < date seuil (+ worklogs/sprints/transitions lies)' },
  { key: 'kpi_results', label: 'Resultats KPI', hint: 'periodStart < date seuil' },
  { key: 'job_logs', label: 'Logs d\'execution', hint: 'startedAt < date seuil' },
];

export default function MaintenancePage() {
  const [beforeDate, setBeforeDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 24);
    return d.toISOString().slice(0, 10);
  });
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [previewResult, setPreviewResult] = useState<Record<string, number> | null>(null);
  const [purgeResult, setPurgeResult] = useState<Record<string, number> | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', true],
    queryFn: () => clientsApi.list(true),
  });

  const previewMutation = useMutation({
    mutationFn: () => maintenanceApi.purgePreview({ beforeDate, clientId, types: selectedTypes }),
    onSuccess: (data) => { setPreviewResult(data.counts); setPurgeResult(null); },
  });

  const executeMutation = useMutation({
    mutationFn: () => maintenanceApi.purgeExecute({ beforeDate, clientId, types: selectedTypes }),
    onSuccess: (data) => { setPurgeResult(data.deleted); setPreviewResult(null); },
  });

  const toggleType = (key: string) => {
    setSelectedTypes((prev) => prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]);
    setPreviewResult(null);
    setPurgeResult(null);
  };

  const canPreview = selectedTypes.length > 0 && beforeDate;

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Maintenance</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
        Purge des donnees anciennes pour alleger la base de donnees.
      </p>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 16px' }}>Purge de donnees</h2>

        {/* Date seuil */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            Date seuil (supprimer avant)
          </label>
          <input type="date" value={beforeDate} onChange={(e) => { setBeforeDate(e.target.value); setPreviewResult(null); setPurgeResult(null); }}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
        </div>

        {/* Client filter */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            Client (optionnel)
          </label>
          <select value={clientId ?? ''} onChange={(e) => { setClientId(e.target.value ? Number(e.target.value) : undefined); setPreviewResult(null); setPurgeResult(null); }}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 200 }}>
            <option value="">Tous les clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Types */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
            Types de donnees a purger
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DATA_TYPES.map((t) => (
              <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: selectedTypes.includes(t.key) ? '#eff6ff' : 'white' }}>
                <input type="checkbox" checked={selectedTypes.includes(t.key)} onChange={() => toggleType(t.key)} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{t.hint}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <button onClick={() => previewMutation.mutate()} disabled={!canPreview || previewMutation.isPending}
            style={{ padding: '7px 16px', background: canPreview ? '#4f94ef' : '#e5e7eb', color: canPreview ? 'white' : '#9ca3af', border: 'none', borderRadius: 6, cursor: canPreview ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
            {previewMutation.isPending ? 'Analyse…' : 'Analyser'}
          </button>

          {previewResult && (
            <button onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}
              style={{ padding: '7px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {executeMutation.isPending ? 'Suppression…' : 'Purger'}
            </button>
          )}
        </div>

        {/* Preview result */}
        {previewResult && (
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 8 }}>Elements a supprimer :</div>
            {Object.entries(previewResult).map(([key, count]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#374151' }}>{key}</span>
                <span style={{ fontWeight: 600, color: count > 0 ? '#dc2626' : '#6b7280' }}>{count.toLocaleString('fr-FR')}</span>
              </div>
            ))}
            {Object.values(previewResult).every((c) => c === 0) && (
              <div style={{ color: '#065f46', marginTop: 4 }}>Aucune donnee a purger pour ces criteres.</div>
            )}
          </div>
        )}

        {/* Purge result */}
        {purgeResult && (
          <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 8 }}>Purge terminee :</div>
            {Object.entries(purgeResult).map(([key, count]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#374151' }}>{key}</span>
                <span style={{ fontWeight: 600, color: '#065f46' }}>{count.toLocaleString('fr-FR')} supprime(s)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AppSettingsSection />
    </div>
  );
}

// ── Paramètres applicatifs ───────────────────────────────────────────────────

function AppSettingsSection() {
  const qc = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: settingsApi.getAll,
    staleTime: 30_000,
  });

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginTop: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>Parametres applicatifs</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
        Cles de configuration systeme editables sans deploiement. Valeurs lues au runtime par le backend et le frontend.
      </p>

      {isLoading && <div style={{ fontSize: 13, color: '#9ca3af' }}>Chargement...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {settings.map((setting) => (
          <SettingRow
            key={setting.key}
            setting={setting}
            onSaved={() => qc.invalidateQueries({ queryKey: ['app-settings'] })}
          />
        ))}
      </div>

      {!isLoading && settings.length === 0 && (
        <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
          Aucun parametre configure. Lancez le seed pour initialiser les valeurs par defaut.
        </div>
      )}
    </div>
  );
}

function SettingRow({
  setting,
  onSaved,
}: {
  setting: { key: string; value: string; description: string | null };
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(setting.value);
  const [saved, setSaved] = useState(false);
  const isDirty = draft !== setting.value;

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.update(setting.key, draft),
    onSuccess: () => {
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const isMultiline = setting.value.includes('\n') || setting.value.length > 80;

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', background: isDirty ? '#fefce8' : '#f9fafb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '1px 6px', borderRadius: 4 }}>
          {setting.key}
        </code>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {saved && (
            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Enregistre</span>
          )}
          {saveMutation.isError && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>Erreur</span>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
            style={{
              padding: '3px 12px', fontSize: 12, fontWeight: 600, borderRadius: 4, cursor: isDirty ? 'pointer' : 'not-allowed',
              border: 'none',
              background: isDirty ? '#4f46e5' : '#e5e7eb',
              color: isDirty ? 'white' : '#9ca3af',
            }}
          >
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {isDirty && (
            <button
              onClick={() => setDraft(setting.value)}
              style={{ padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #d1d5db', background: 'white', color: '#6b7280', cursor: 'pointer' }}
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      {setting.description && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{setting.description}</div>
      )}

      {isMultiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(6, draft.split('\n').length + 1)}
          style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: 'white' }}
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box', background: 'white' }}
        />
      )}
    </div>
  );
}
