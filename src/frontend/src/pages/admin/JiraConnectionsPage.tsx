import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importsApi, jiraConnectionsApi } from '@/api/endpoints';
import type { JiraConnection } from '@/types';

// ─── Composant select pour champs JIRA ──────────────────────────────────────

function JiraFieldSelect({
  connectionId,
  value,
  onChange,
  placeholder,
}: {
  connectionId: number | null;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const queryClient = useQueryClient();
  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['jira-fields', connectionId],
    queryFn: () => jiraConnectionsApi.getFields(connectionId!),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: () => jiraConnectionsApi.syncFields(connectionId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jira-fields', connectionId] }),
  });

  if (!connectionId) {
    return (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} style={inputStyle} />
    );
  }

  if (fields.length === 0 && !isLoading) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} style={{ ...inputStyle, flex: 1 }} />
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          style={{ padding: '6px 10px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {syncMutation.isPending ? 'Chargement…' : 'Charger les champs'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}
      >
        <option value="">-- Aucun --</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({f.id})
          </option>
        ))}
      </select>
      <button
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        title="Rafraichir la liste des champs depuis JIRA"
        style={{ padding: '6px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
      >
        {syncMutation.isPending ? '…' : '↻'}
      </button>
    </div>
  );
}

// ─── Modal création ────────────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  tempoApiToken: string;
  storyPointsField: string;
  sprintsField: string;
  returnLinkType: string;
}

const EMPTY_FORM: CreateForm = {
  name: '', jiraUrl: '', jiraEmail: '', jiraApiToken: '', tempoApiToken: '',
  storyPointsField: 'customfield_10016', sprintsField: 'customfield_10020',
  returnLinkType: 'est un retour de',
};

// ─── Modal édition ─────────────────────────────────────────────────────────────

function EditModal({ conn, onClose }: { conn: JiraConnection; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>({
    name: conn.name,
    jiraUrl: conn.jiraUrl,
    jiraEmail: conn.jiraEmail,
    jiraApiToken: '',           // ne jamais pré-remplir le token
    tempoApiToken: '',
    storyPointsField: conn.fieldMapping?.storyPoints ?? 'customfield_10016',
    sprintsField: conn.fieldMapping?.sprints ?? 'customfield_10020',
    returnLinkType: conn.fieldMapping?.returnLinkType ?? 'est un retour de',
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; user?: string } | null>(null);

  function setField(key: keyof CreateForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  const testMutation = useMutation({
    mutationFn: () =>
      form.jiraApiToken
        ? jiraConnectionsApi.test({ jiraUrl: form.jiraUrl, jiraEmail: form.jiraEmail, jiraApiToken: form.jiraApiToken })
        : jiraConnectionsApi.testExisting(conn.id),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Impossible de joindre le serveur.' }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      jiraConnectionsApi.update(conn.id, {
        name: form.name,
        jiraUrl: form.jiraUrl,
        jiraEmail: form.jiraEmail,
        ...(form.jiraApiToken && { jiraApiToken: form.jiraApiToken }),
        ...(form.tempoApiToken && { tempoApiToken: form.tempoApiToken }),
        fieldMapping: { storyPoints: form.storyPointsField || undefined, sprints: form.sprintsField || undefined, returnLinkType: form.returnLinkType || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jira-connections'] });
      onClose();
    },
  });

  const canSave = form.name && form.jiraUrl && form.jiraEmail;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 10, padding: 28,
          width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>
          Modifier la connexion JIRA
        </h2>

        <Field label="Nom *">
          <input autoFocus type="text" value={form.name} onChange={setField('name')}
            style={inputStyle} />
        </Field>
        <Field label="URL de l'instance *">
          <input type="url" value={form.jiraUrl} onChange={setField('jiraUrl')}
            style={inputStyle} />
        </Field>
        <Field label="Email du compte JIRA *">
          <input type="email" value={form.jiraEmail} onChange={setField('jiraEmail')}
            style={inputStyle} />
        </Field>
        <Field
          label="Token API JIRA"
          hint="Laisser vide pour conserver le token actuel"
        >
          <input type="password" value={form.jiraApiToken} onChange={setField('jiraApiToken')}
            placeholder="Nouveau token (laisser vide = inchangé)" style={inputStyle} />
        </Field>
        <Field label="Token API Tempo (optionnel)" hint="Laisser vide pour conserver le token actuel">
          <input type="password" value={form.tempoApiToken} onChange={setField('tempoApiToken')}
            placeholder="Nouveau token Tempo (laisser vide = inchangé)" style={inputStyle} />
        </Field>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Mapping des champs JIRA</div>
          <Field label="Story Points" hint="Champ custom JIRA contenant les story points">
            <JiraFieldSelect connectionId={conn.id} value={form.storyPointsField}
              onChange={(v) => setForm((f) => ({ ...f, storyPointsField: v }))} placeholder="customfield_10016" />
          </Field>
          <Field label="Sprints" hint="Champ custom JIRA contenant les sprints">
            <JiraFieldSelect connectionId={conn.id} value={form.sprintsField}
              onChange={(v) => setForm((f) => ({ ...f, sprintsField: v }))} placeholder="customfield_10020" />
          </Field>
          <Field label="Type de lien retour" hint="Nom du type de lien JIRA pour les tickets de retour (ex. : est un retour de)">
            <input type="text" value={form.returnLinkType} onChange={setField('returnLinkType')}
              placeholder="est un retour de" style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => { setTestResult(null); testMutation.mutate(); }}
            disabled={!form.jiraUrl || !form.jiraEmail || testMutation.isPending}
            style={{
              padding: '7px 14px', background: '#059669', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {testMutation.isPending ? 'Test en cours…' : 'Tester la connexion'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#065f46' : '#991b1b' }}>
              {testResult.ok ? `✓ Connexion réussie (${testResult.user ?? 'OK'})` : `✗ ${testResult.error}`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}
          >
            Annuler
          </button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!canSave || updateMutation.isPending}
            style={{
              padding: '7px 20px',
              background: canSave ? '#4f94ef' : '#e5e7eb',
              color: canSave ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 6, cursor: canSave ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal création ────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; user?: string } | null>(null);

  function setField(key: keyof CreateForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  const testMutation = useMutation({
    mutationFn: () =>
      jiraConnectionsApi.test({
        jiraUrl: form.jiraUrl,
        jiraEmail: form.jiraEmail,
        jiraApiToken: form.jiraApiToken,
      }),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Impossible de joindre le serveur.' }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      jiraConnectionsApi.create({
        name: form.name,
        jiraUrl: form.jiraUrl,
        jiraEmail: form.jiraEmail,
        jiraApiToken: form.jiraApiToken,
        tempoApiToken: form.tempoApiToken || undefined,
        fieldMapping: { storyPoints: form.storyPointsField || undefined, sprints: form.sprintsField || undefined, returnLinkType: form.returnLinkType || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jira-connections'] });
      onClose();
    },
  });

  const canCreate = form.name && form.jiraUrl && form.jiraEmail && form.jiraApiToken;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 10, padding: 28,
          width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>
          Nouvelle connexion JIRA
        </h2>

        <Field label="Nom *" hint="Libellé interne (ex. : DECADE Jira Cloud)">
          <input autoFocus type="text" value={form.name} onChange={setField('name')}
            placeholder="Mon instance JIRA" style={inputStyle} />
        </Field>
        <Field label="URL de l'instance *" hint="Ex. : https://monentreprise.atlassian.net">
          <input type="url" value={form.jiraUrl} onChange={setField('jiraUrl')}
            placeholder="https://votre-instance.atlassian.net" style={inputStyle} />
        </Field>
        <Field label="Email du compte JIRA *" hint="Compte de service avec accès en lecture">
          <input type="email" value={form.jiraEmail} onChange={setField('jiraEmail')}
            placeholder="portailkpi@monentreprise.fr" style={inputStyle} />
        </Field>
        <Field
          label="Token API JIRA *"
          hint={<>Générez votre token sur <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" style={{ color: '#4f94ef' }}>id.atlassian.com</a></>}
        >
          <input type="password" value={form.jiraApiToken} onChange={setField('jiraApiToken')}
            placeholder="ATATT3x…" style={inputStyle} />
        </Field>
        <Field label="Token API Tempo (optionnel)" hint="Uniquement si vous utilisez Tempo Timesheets">
          <input type="password" value={form.tempoApiToken} onChange={setField('tempoApiToken')}
            placeholder="Tempo token…" style={inputStyle} />
        </Field>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Mapping des champs JIRA</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
            Configurable apres creation via le bouton Modifier (liste des champs auto-detectee).
          </div>
          <Field label="Story Points" hint="Par defaut : customfield_10016">
            <input type="text" value={form.storyPointsField} onChange={setField('storyPointsField')}
              placeholder="customfield_10016" style={inputStyle} />
          </Field>
          <Field label="Sprints" hint="Par defaut : customfield_10020">
            <input type="text" value={form.sprintsField} onChange={setField('sprintsField')}
              placeholder="customfield_10020" style={inputStyle} />
          </Field>
          <Field label="Type de lien retour" hint="Par defaut : est un retour de">
            <input type="text" value={form.returnLinkType} onChange={setField('returnLinkType')}
              placeholder="est un retour de" style={inputStyle} />
          </Field>
        </div>

        {/* Bouton test inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => { setTestResult(null); testMutation.mutate(); }}
            disabled={!form.jiraUrl || !form.jiraEmail || !form.jiraApiToken || testMutation.isPending}
            style={{
              padding: '7px 14px', background: '#059669', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {testMutation.isPending ? 'Test en cours…' : 'Tester la connexion'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#065f46' : '#991b1b' }}>
              {testResult.ok ? `✓ Connexion réussie (${testResult.user ?? 'OK'})` : `✗ ${testResult.error}`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}
          >
            Annuler
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canCreate || createMutation.isPending}
            style={{
              padding: '7px 20px',
              background: canCreate ? '#4f94ef' : '#e5e7eb',
              color: canCreate ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 6, cursor: canCreate ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SyncJiraConnectionUsersModal({
  jiraConnectionId,
  connectionName,
  onClose,
  onDone,
}: {
  jiraConnectionId: number;
  connectionName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['jira-connection-user-candidates', jiraConnectionId, page, search, selectedProjects.join('|'), selectedGroups.join('|')],
    queryFn: () => importsApi.getJiraConnectionUserCandidates(jiraConnectionId, {
      page,
      pageSize,
      search,
      projectKeys: selectedProjects,
      groupNames: selectedGroups,
    }),
  });

  const syncMutation = useMutation({
    mutationFn: (accountIds: string[]) => importsApi.syncJiraConnectionUsers(jiraConnectionId, accountIds),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const excludeMutation = useMutation({
    mutationFn: (payload: { accountId: string; displayName: string; emailAddress: string | null }) =>
      importsApi.excludeJiraConnectionUser({ jiraConnectionId, ...payload }),
    onSuccess: (_data, vars) => {
      setSelected((prev) => prev.filter((id) => id !== vars.accountId));
      queryClient.invalidateQueries({ queryKey: ['jira-connection-user-candidates', jiraConnectionId] });
    },
  });

  const candidates = data?.candidates ?? [];
  const selectedSet = new Set(selected);
  const allVisibleSelected = candidates.length > 0 && candidates.every((u) => selectedSet.has(u.accountId));

  const toggleOne = (accountId: string) => {
    setSelected((prev) => (prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]));
  };

  const toggleVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(candidates.map((u) => u.accountId));
      setSelected((prev) => prev.filter((id) => !visibleIds.has(id)));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of candidates) next.add(c.accountId);
      return [...next];
    });
  };

  const readMultiSelectValues = (event: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(event.target.selectedOptions).map((o) => o.value);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 760, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Sync utilisateurs Jira</h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>
          Connexion: <strong>{connectionName}</strong>. Les utilisateurs sont filtres par les projets actifs relies a cette connexion.
        </p>

        {isLoading && <div style={{ padding: '14px 0', color: '#6b7280' }}>Chargement des utilisateurs Jira...</div>}

        {!isLoading && !data?.hasProjects && (
          <div style={{ marginBottom: 14, fontSize: 13, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
            {data?.message ?? 'Aucun projet actif associe a cette connexion Jira.'}
          </div>
        )}

        {!isLoading && data?.hasProjects && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Rechercher par nom, email, accountId ou projet"
                style={{ ...inputStyle, flex: 1, minWidth: 260 }}
              />
              <button
                type="button"
                onClick={toggleVisible}
                style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 12 }}
              >
                {allVisibleSelected ? 'Tout deselectionner' : 'Tout selectionner'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Critere projet (projets actifs)</div>
                <select
                  multiple
                  value={selectedProjects}
                  onChange={(e) => { setSelectedProjects(readMultiSelectValues(e)); setPage(1); }}
                  style={{ ...inputStyle, minHeight: 84 }}
                >
                  {(data?.availableProjects ?? []).map((projectKey) => (
                    <option key={projectKey} value={projectKey}>{projectKey}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Critere groupe Jira</div>
                <select
                  multiple
                  value={selectedGroups}
                  onChange={(e) => { setSelectedGroups(readMultiSelectValues(e)); setPage(1); }}
                  style={{ ...inputStyle, minHeight: 84 }}
                >
                  {(data?.availableGroups ?? []).map((groupName) => (
                    <option key={groupName} value={groupName}>{groupName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
              {selected.length} selectionne(s) sur {data.total} utilisateur(s)
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 380, overflowY: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '26px 1.1fr 0.8fr 0.8fr auto auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '7px 12px',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6b7280',
                }}
              >
                <span />
                <span>Utilisateur</span>
                <span>Projets associes</span>
                <span>Groupes Jira</span>
                <span>Statut</span>
                <span>Action</span>
              </div>
              {candidates.length === 0 && (
                <div style={{ padding: '12px 14px', color: '#9ca3af', fontSize: 13 }}>Aucun utilisateur correspondant.</div>
              )}
              {candidates.map((u) => {
                const checked = selectedSet.has(u.accountId);
                return (
                  <div
                    key={u.accountId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '26px 1.1fr 0.8fr 0.8fr auto auto',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f3f4f6',
                      background: checked ? '#eff6ff' : 'white',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleOne(u.accountId)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 600 }}>{u.displayName}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{u.emailAddress || '(email non disponible)'}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{u.accountId}</div>
                    </div>
                    <div style={{ minWidth: 0, fontSize: 11, color: '#374151' }}>
                      {u.associatedProjects.length > 0 ? u.associatedProjects.join(', ') : '(aucun)'}
                    </div>
                    <div style={{ minWidth: 0, fontSize: 11, color: '#374151' }}>
                      {u.jiraGroups.length > 0 ? u.jiraGroups.join(', ') : '(aucun)'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {u.alreadyImported && (
                        <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                          deja en BDD
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => excludeMutation.mutate({ accountId: u.accountId, displayName: u.displayName, emailAddress: u.emailAddress })}
                      disabled={excludeMutation.isPending}
                      style={{ padding: '5px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fee2e2', color: '#991b1b', cursor: excludeMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600 }}
                    >
                      Exclure
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Page {data.page} / {Math.max(1, data.totalPages)}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1}
                  style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: data.page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}
                >
                  Precedent
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(Math.max(1, data.totalPages), p + 1))}
                  disabled={data.page >= Math.max(1, data.totalPages)}
                  style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: data.page >= Math.max(1, data.totalPages) ? 'not-allowed' : 'pointer', fontSize: 12 }}
                >
                  Suivant
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button
            onClick={() => syncMutation.mutate(selected)}
            disabled={syncMutation.isPending || !data?.hasProjects || selected.length === 0}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: 6,
              background: syncMutation.isPending || selected.length === 0 ? '#e5e7eb' : '#10b981',
              color: syncMutation.isPending || selected.length === 0 ? '#9ca3af' : 'white',
              cursor: syncMutation.isPending || selected.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {syncMutation.isPending ? 'Synchronisation...' : `Synchroniser (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte connexion ───────────────────────────────────────────────────────────

function ConnectionCard({ conn }: { conn: JiraConnection & { _count?: { clients: number } } }) {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; user?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const testMutation = useMutation({
    mutationFn: () => jiraConnectionsApi.testExisting(conn.id),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Impossible de joindre le serveur.' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => jiraConnectionsApi.remove(conn.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jira-connections'] }),
    onError: (err: Error) => alert(err.message),
  });

  const clientCount = conn._count?.clients ?? 0;

  return (
    <div style={{
      background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{conn.name}</div>
          <div style={{ fontSize: 13, color: '#4f94ef', marginTop: 2 }}>{conn.jiraUrl}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{conn.jiraEmail}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: clientCount > 0 ? '#dbeafe' : '#f3f4f6',
            color: clientCount > 0 ? '#1d4ed8' : '#6b7280',
          }}>
            {clientCount} client{clientCount !== 1 ? 's' : ''}
          </span>
          {conn.tempoApiToken && (
            <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>
              Tempo activé
            </span>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 13,
          background: testResult.ok ? '#d1fae5' : '#fee2e2',
          color: testResult.ok ? '#065f46' : '#991b1b',
        }}>
          {testResult.ok ? `✓ Connexion opérationnelle (${testResult.user ?? 'OK'})` : `✗ ${testResult.error}`}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => { setTestResult(null); testMutation.mutate(); }}
          disabled={testMutation.isPending}
          style={{
            padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6,
            background: 'white', cursor: 'pointer', fontSize: 12,
          }}
        >
          {testMutation.isPending ? 'Test…' : 'Tester'}
        </button>

        <button
          onClick={() => setShowEdit(true)}
          style={{
            padding: '5px 12px', border: '1px solid #93c5fd', borderRadius: 6,
            background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          Modifier
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={clientCount > 0}
            title={clientCount > 0 ? `Réassignez les ${clientCount} client(s) avant de supprimer` : 'Supprimer'}
            style={{
              padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 6,
              background: clientCount > 0 ? '#f9fafb' : '#fee2e2',
              color: clientCount > 0 ? '#d1d5db' : '#991b1b',
              cursor: clientCount > 0 ? 'not-allowed' : 'pointer', fontSize: 12,
            }}
          >
            Supprimer
          </button>
        ) : (
          <>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              style={{ padding: '5px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {deleteMutation.isPending ? 'Suppression…' : 'Confirmer'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 12 }}
            >
              Annuler
            </button>
          </>
        )}
      </div>

      {showEdit && <EditModal conn={conn} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function JiraConnectionsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: connections, isLoading } = useQuery({
    queryKey: ['jira-connections'],
    queryFn: jiraConnectionsApi.list,
  });

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
            Connexions JIRA
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Gérez les instances JIRA accessibles par le portail. Une connexion peut être partagée entre plusieurs clients.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '8px 18px', background: '#4f94ef', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          + Nouvelle connexion
        </button>
      </div>

      {isLoading && <div style={{ color: '#6b7280', fontSize: 14 }}>Chargement…</div>}

      {!isLoading && !connections?.length && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          border: '2px dashed #e5e7eb', borderRadius: 8, color: '#9ca3af',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔌</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Aucune connexion JIRA configurée</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Créez une connexion pour pouvoir ensuite associer des clients.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connections?.map((conn) => (
          <ConnectionCard key={conn.id} conn={conn} />
        ))}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 10px',
  borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, boxSizing: 'border-box', outline: 'none',
};
