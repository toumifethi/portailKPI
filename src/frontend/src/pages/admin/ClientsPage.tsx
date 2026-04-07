import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi, jiraConnectionsApi } from '@/api/endpoints';
import { AddProjectModal } from '@/components/shared/AddProjectModal';
import { ClientKpiSection } from '@/components/shared/ClientKpiSection';
import type { Client, JiraConnection, ProjectConfig, JiraFieldInfo } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModalStep = 'info' | 'jira' | 'recap' | 'projects';
type JiraMode = 'existing' | 'new';

interface CreateForm {
  name: string;
  jiraMode: JiraMode;
  jiraConnectionId: number | null;
  connectionName: string;
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  returnInternalIssueType: string;
  returnClientIssueType: string;
}

interface EditForm {
  name: string;
  jiraConnectionId: number | null;
  extraJiraFields: string[];
  returnInternalIssueType: string;
  returnClientIssueType: string;
  importTransitions: boolean;
}

const EMPTY_FORM: CreateForm = {
  name: '', jiraMode: 'existing', jiraConnectionId: null,
  connectionName: '', jiraUrl: '', jiraEmail: '', jiraApiToken: '',
  returnInternalIssueType: '', returnClientIssueType: '',
};

// ─── Page principale ───────────────────────────────────────────────────────────

export default function ClientsPage() {
  const queryClient = useQueryClient();

  // ── État création ──
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<ModalStep>('info');
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [newConnTestResult, setNewConnTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [newConnSaved, setNewConnSaved] = useState<JiraConnection | null>(null);
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);

  // ── État édition ──
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    jiraConnectionId: null,
    extraJiraFields: [],
    returnInternalIssueType: '',
    returnClientIssueType: '',
    importTransitions: false,
  });

  // ── État archivage / suppression ──
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', showArchived],
    queryFn: () => clientsApi.list(showArchived),
  });

  const { data: jiraConnections } = useQuery({
    queryKey: ['jira-connections'],
    queryFn: jiraConnectionsApi.list,
    enabled: showCreate || showEdit,
  });

  const editClientId = selectedClient?.id ?? null;

  const {
    data: editIssueTypesData,
    isLoading: editIssueTypesLoading,
    isFetching: editIssueTypesFetching,
    refetch: refetchEditIssueTypes,
  } = useQuery({
    queryKey: ['client-issue-types', editClientId],
    queryFn: () => clientsApi.getIssueTypes(editClientId!),
    enabled: showEdit && editClientId !== null,
    staleTime: 60_000,
  });

  const editIssueTypes = editIssueTypesData?.issueTypes ?? [];
  const editHasProjects = editIssueTypesData?.hasProjects ?? false;
  const editIssueTypeMessage = editIssueTypesData?.message;

  const { data: createdClientProjects } = useQuery({
    queryKey: ['client-projects', createdClientId],
    queryFn: () => clientsApi.getProjects(createdClientId!),
    enabled: step === 'projects' && createdClientId !== null,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const testExistingMutation = useMutation({
    mutationFn: (id: number) => clientsApi.testConnection(id),
  });

  const testNewConnMutation = useMutation({
    mutationFn: () => jiraConnectionsApi.test({ jiraUrl: form.jiraUrl, jiraEmail: form.jiraEmail, jiraApiToken: form.jiraApiToken }),
    onSuccess: (data) => setNewConnTestResult(data),
    onError: () => setNewConnTestResult({ ok: false, error: 'Impossible de joindre le serveur.' }),
  });

  const createConnectionMutation = useMutation({
    mutationFn: () => jiraConnectionsApi.create({ name: form.connectionName || form.jiraUrl, jiraUrl: form.jiraUrl, jiraEmail: form.jiraEmail, jiraApiToken: form.jiraApiToken }),
    onSuccess: (conn) => {
      setNewConnSaved(conn);
      queryClient.invalidateQueries({ queryKey: ['jira-connections'] });
      setStep('recap');
    },
  });

  const createClientMutation = useMutation({
    mutationFn: () => {
      const connectionId = form.jiraMode === 'existing' ? form.jiraConnectionId! : newConnSaved!.id;
      return clientsApi.create({
        name: form.name,
        jiraConnectionId: connectionId,
        returnInternalIssueTypes: form.returnInternalIssueType ? [form.returnInternalIssueType] : null,
        returnClientIssueTypes: form.returnClientIssueType ? [form.returnClientIssueType] : null,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setCreatedClientId(created.id);
      setSelectedClient(created);
      setStep('projects');
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: () => {
      return clientsApi.update(selectedClient!.id, {
        name: editForm.name,
        jiraConnectionId: editForm.jiraConnectionId ?? undefined,
        extraJiraFields: editForm.extraJiraFields.length > 0 ? editForm.extraJiraFields : null,
        returnInternalIssueTypes: editForm.returnInternalIssueType ? [editForm.returnInternalIssueType] : null,
        returnClientIssueTypes: editForm.returnClientIssueType ? [editForm.returnClientIssueType] : null,
        importTransitions: editForm.importTransitions,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setSelectedClient(updated);
      setShowEdit(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => clientsApi.archive(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setArchivingId(null);
      setArchiveReason('');
      setSelectedClient(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setDeletingClient(null);
      setDeleteConfirmName('');
      setSelectedClient(null);
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function openModal() {
    const hasConnections = (jiraConnections?.length ?? 0) > 0;
    setForm({ ...EMPTY_FORM, jiraMode: hasConnections ? 'existing' : 'new' });
    setStep('info');
    setNewConnTestResult(null);
    setNewConnSaved(null);
    setCreatedClientId(null);
    setShowCreate(true);
  }

  function closeModal() {
    setShowCreate(false);
    setStep('info');
    setForm(EMPTY_FORM);
    setNewConnTestResult(null);
    setNewConnSaved(null);
    setCreatedClientId(null);
  }

  function openEdit() {
    if (!selectedClient) return;
    setEditForm({
      name: selectedClient.name,
      jiraConnectionId: selectedClient.jiraConnectionId,
      extraJiraFields: selectedClient.extraJiraFields ?? [],
      returnInternalIssueType: selectedClient.returnInternalIssueTypes?.[0] ?? '',
      returnClientIssueType: selectedClient.returnClientIssueTypes?.[0] ?? '',
      importTransitions: selectedClient.importTransitions ?? false,
    });
    setShowEdit(true);
  }

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleCreateConnectionSelect(nextConnectionId: number) {
    const prevConnectionId = form.jiraConnectionId;
    if (prevConnectionId !== null && prevConnectionId !== nextConnectionId) {
      const hasConfiguredTypes = !!form.returnInternalIssueType || !!form.returnClientIssueType;
      if (hasConfiguredTypes) {
        const confirmed = window.confirm('Changer la connexion JIRA va réinitialiser les types de retour sélectionnés. Continuer ?');
        if (!confirmed) return;
      }
    }

    setForm((f) => ({
      ...f,
      jiraConnectionId: nextConnectionId,
      returnInternalIssueType: '',
      returnClientIssueType: '',
    }));
  }

  function handleEditConnectionSelect(nextConnectionId: number) {
    const prevConnectionId = editForm.jiraConnectionId;
    if (prevConnectionId !== null && prevConnectionId !== nextConnectionId) {
      const hasConfiguredTypes = !!editForm.returnInternalIssueType || !!editForm.returnClientIssueType;
      if (hasConfiguredTypes) {
        const confirmed = window.confirm('Changer la connexion JIRA va réinitialiser les types de retour sélectionnés. Continuer ?');
        if (!confirmed) return;
      }
    }

    setEditForm((f) => ({
      ...f,
      jiraConnectionId: nextConnectionId,
      returnInternalIssueType: '',
      returnClientIssueType: '',
    }));
  }

  function inputField(key: keyof CreateForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setField(key, e.target.value as CreateForm[typeof key]);
  }

  const jiraStepValid =
    form.jiraMode === 'existing'
      ? form.jiraConnectionId !== null
      : newConnTestResult?.ok === true || newConnSaved !== null;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (isLoading) return <div style={{ padding: 40 }}>Chargement…</div>;

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 120px)' }}>

      {/* ── Panneau liste ── */}
      <div style={{ width: 280, flexShrink: 0, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Clients ({clients?.length ?? 0})</span>
            <button onClick={openModal} style={{ padding: '4px 12px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              + Nouveau
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Afficher les archives
          </label>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {clients?.map((client) => (
            <div
              key={client.id}
              onClick={() => { setSelectedClient(client); testExistingMutation.reset(); }}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                background: selectedClient?.id === client.id ? '#eff6ff' : client.status === 'ARCHIVED' ? '#f9fafb' : 'white',
                borderLeft: selectedClient?.id === client.id ? '3px solid #4f94ef' : '3px solid transparent',
                opacity: client.status === 'ARCHIVED' ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{client.name}</span>
                {client.status === 'ARCHIVED' && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>Archive</span>
                )}
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: client.status === 'ACTIVE' ? '#10b981' : '#6b7280' }}>
                {client.status === 'ACTIVE' ? 'Actif' : client.status === 'ARCHIVED' ? 'Archive' : client.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panneau détail ── */}
      <div style={{ flex: 1, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', padding: 24, overflowY: 'auto' }}>
        {!selectedClient ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            Sélectionnez un client ou créez-en un nouveau.
          </div>
        ) : (
          <ClientDetail
            client={selectedClient}
            onEdit={openEdit}
            onArchive={(id) => setArchivingId(id)}
            onDelete={(c) => { setDeletingClient(c); setDeleteConfirmName(''); }}
            testMutation={testExistingMutation}
          />
        )}
      </div>

      {/* ══ Modal création ══════════════════════════════════════════════════ */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={step !== 'projects' ? closeModal : undefined}>
          <div style={{ background: 'white', borderRadius: 10, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>

            <StepIndicator step={step} />

            {/* Étape 1 : Nom */}
            {step === 'info' && (
              <>
                <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nouveau client — Informations générales</h2>
                <Field label="Nom du client *" hint="Ex. : Projet Alpha, Équipe Backoffice…">
                  <input autoFocus type="text" value={form.name} onChange={inputField('name')} placeholder="Nom du client" style={inputStyle} />
                </Field>
                <ModalActions onCancel={closeModal} onNext={() => setStep('jira')} nextLabel="Suivant →" nextDisabled={!form.name.trim()} />
              </>
            )}

            {/* Étape 2 : Instance JIRA */}
            {step === 'jira' && (
              <>
                <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Instance JIRA</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>Choisissez une connexion existante ou configurez-en une nouvelle.</p>

                <div style={{ display: 'flex', marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  {(['existing', 'new'] as JiraMode[]).map((mode) => (
                    <button key={mode} onClick={() => { setField('jiraMode', mode); setNewConnTestResult(null); }}
                      style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 13, background: form.jiraMode === mode ? '#4f94ef' : 'white', color: form.jiraMode === mode ? 'white' : '#374151', fontWeight: form.jiraMode === mode ? 600 : 400 }}>
                      {mode === 'existing' ? 'Connexion existante' : 'Nouvelle connexion'}
                    </button>
                  ))}
                </div>

                {form.jiraMode === 'existing' && (
                  !jiraConnections?.length ? (
                    <div style={{ padding: 16, background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                      Aucune connexion JIRA disponible. Passez en mode "Nouvelle connexion".
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {jiraConnections.map((conn) => (
                        <div key={conn.id} onClick={() => handleCreateConnectionSelect(conn.id)}
                          style={{ padding: '10px 14px', borderRadius: 6, cursor: 'pointer', border: form.jiraConnectionId === conn.id ? '2px solid #4f94ef' : '1px solid #e5e7eb', background: form.jiraConnectionId === conn.id ? '#eff6ff' : '#f9fafb' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{conn.name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{conn.jiraUrl} · {conn.jiraEmail}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {form.jiraMode === 'new' && (
                  <>
                    <Field label="Nom de la connexion *"><input autoFocus type="text" value={form.connectionName} onChange={inputField('connectionName')} placeholder="Nom de l'instance JIRA" style={inputStyle} /></Field>
                    <Field label="URL de l'instance JIRA *"><input type="url" value={form.jiraUrl} onChange={inputField('jiraUrl')} placeholder="https://votre-instance.atlassian.net" style={inputStyle} /></Field>
                    <Field label="Email du compte JIRA *"><input type="email" value={form.jiraEmail} onChange={inputField('jiraEmail')} placeholder="portailkpi@monentreprise.fr" style={inputStyle} /></Field>
                    <Field label="Token API JIRA *"><input type="password" value={form.jiraApiToken} onChange={inputField('jiraApiToken')} placeholder="ATATT3x…" style={inputStyle} /></Field>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <button onClick={() => { setNewConnTestResult(null); testNewConnMutation.mutate(); }}
                        disabled={!form.jiraUrl || !form.jiraEmail || !form.jiraApiToken || testNewConnMutation.isPending}
                        style={{ padding: '7px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {testNewConnMutation.isPending ? 'Test…' : 'Tester la connexion'}
                      </button>
                      {newConnTestResult && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: newConnTestResult.ok ? '#065f46' : '#991b1b' }}>
                          {newConnTestResult.ok ? '✓ Connexion réussie' : `✗ ${newConnTestResult.error}`}
                        </span>
                      )}
                    </div>
                  </>
                )}

                <ModalActions onCancel={() => setStep('info')} cancelLabel="← Retour"
                  onNext={() => { if (form.jiraMode === 'new' && !newConnSaved) { createConnectionMutation.mutate(); } else { setStep('recap'); } }}
                  nextLabel={form.jiraMode === 'new' && !newConnSaved ? (createConnectionMutation.isPending ? 'Enregistrement…' : 'Enregistrer et continuer →') : 'Suivant →'}
                  nextDisabled={!jiraStepValid || createConnectionMutation.isPending} />
              </>
            )}

            {/* Étape 3 : Récapitulatif */}
            {step === 'recap' && (
              <>
                <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Récapitulatif</h2>
                <div style={{ background: '#f9fafb', borderRadius: 6, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <RecapRow label="Nom" value={form.name} />
                  <RecapRow label="Connexion JIRA" value={form.jiraMode === 'existing' ? jiraConnections?.find((c) => c.id === form.jiraConnectionId)?.name ?? String(form.jiraConnectionId) : newConnSaved?.name ?? form.connectionName} />
                </div>

                <div style={{ marginBottom: 12, fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
                  Ajoutez d'abord au moins un projet JIRA (étape suivante) pour configurer les types de retour filtrés par projet.
                </div>

                <Field label="Type retour interne" hint="Configuration disponible après ajout d'un projet JIRA.">
                  <select
                    value={form.returnInternalIssueType}
                    onChange={(e) => setForm((f) => ({ ...f, returnInternalIssueType: e.target.value }))}
                    style={inputStyle}
                    disabled
                  >
                    <option value="">(configurer après ajout de projet)</option>
                  </select>
                </Field>

                <Field label="Type retour client" hint="Configuration disponible après ajout d'un projet JIRA.">
                  <select
                    value={form.returnClientIssueType}
                    onChange={(e) => setForm((f) => ({ ...f, returnClientIssueType: e.target.value }))}
                    style={inputStyle}
                    disabled
                  >
                    <option value="">(configurer après ajout de projet)</option>
                  </select>
                </Field>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setStep('jira')} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>← Modifier</button>
                  <button onClick={() => createClientMutation.mutate()} disabled={createClientMutation.isPending}
                    style={{ padding: '7px 20px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {createClientMutation.isPending ? 'Création…' : '✓ Créer le client'}
                  </button>
                </div>
              </>
            )}

            {/* Étape 4 : Projets (post-création) */}
            {step === 'projects' && createdClientId && (
              <>
                <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Associer des projets JIRA</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
                  Le client a été créé. Ajoutez les projets JIRA à importer.
                </p>

                {createdClientProjects && createdClientProjects.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {createdClientProjects.map((p) => (
                      <div key={p.jiraProjectKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#065f46' }}>{p.jiraProjectKey}</span>
                          <span style={{ fontSize: 13, color: '#374151', marginLeft: 8 }}>{p.jiraProjectName}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#059669' }}>ajouté</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => setShowAddProject(true)}
                  style={{ padding: '7px 16px', background: 'white', border: '1px solid #4f94ef', color: '#4f94ef', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
                  + Ajouter un projet JIRA
                </button>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={closeModal} style={{ padding: '7px 20px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Terminer
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* AddProjectModal pour l'étape projets */}
      {showAddProject && createdClientId && (
        <AddProjectModal
          clientId={createdClientId}
          onClose={() => setShowAddProject(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['client-projects', createdClientId] })}
        />
      )}

      {/* ══ Modal édition ══════════════════════════════════════════════════ */}
      {showEdit && selectedClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowEdit(false)}>
          <div style={{ background: 'white', borderRadius: 10, padding: 28, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Modifier le client</h2>

            <Field label="Nom du client *">
              <input autoFocus type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </Field>

            <Field label="Connexion JIRA">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {jiraConnections?.map((conn) => (
                  <div key={conn.id} onClick={() => handleEditConnectionSelect(conn.id)}
                    style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: editForm.jiraConnectionId === conn.id ? '2px solid #4f94ef' : '1px solid #e5e7eb', background: editForm.jiraConnectionId === conn.id ? '#eff6ff' : '#f9fafb' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{conn.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{conn.jiraUrl}</div>
                  </div>
                ))}
              </div>
            </Field>

            <JiraFieldSelector
              clientId={selectedClient!.id}
              selected={editForm.extraJiraFields}
              onChange={(ids) => setEditForm((f) => ({ ...f, extraJiraFields: ids }))}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => refetchEditIssueTypes()}
                disabled={editIssueTypesFetching}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  background: 'white',
                  cursor: editIssueTypesFetching ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  color: '#374151',
                }}
              >
                {editIssueTypesFetching ? 'Rafraichissement…' : 'Rafraichir les types Jira'}
              </button>
            </div>

            <Field label="Type retour interne" hint="Choix unique parmi les types des projets actifs du client.">
              {!editHasProjects && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
                  {editIssueTypeMessage ?? 'Aucun projet actif associé. Ajoutez un projet JIRA avant de configurer les types de retour.'}
                </div>
              )}
              <select
                value={editForm.returnInternalIssueType}
                onChange={(e) => setEditForm((f) => ({ ...f, returnInternalIssueType: e.target.value }))}
                style={inputStyle}
                disabled={!editHasProjects || editIssueTypesLoading}
              >
                <option value="">(non configuré)</option>
                {editIssueTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </Field>

            <Field label="Type retour client" hint="Choix unique parmi les types des projets actifs du client.">
              <select
                value={editForm.returnClientIssueType}
                onChange={(e) => setEditForm((f) => ({ ...f, returnClientIssueType: e.target.value }))}
                style={inputStyle}
                disabled={!editHasProjects || editIssueTypesLoading}
              >
                <option value="">(non configuré)</option>
                {editIssueTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </Field>

            <Field label="Import des transitions" hint="Active l'import de l'historique des changements de statut depuis le changelog JIRA.">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={editForm.importTransitions}
                  onChange={(e) => setEditForm((f) => ({ ...f, importTransitions: e.target.checked }))}
                />
                Importer les transitions de statut
              </label>
            </Field>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setShowEdit(false)} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={() => updateClientMutation.mutate()} disabled={!editForm.name.trim() || updateClientMutation.isPending}
                style={{ padding: '7px 20px', background: editForm.name.trim() ? '#4f94ef' : '#e5e7eb', color: editForm.name.trim() ? 'white' : '#9ca3af', border: 'none', borderRadius: 6, cursor: editForm.name.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                {updateClientMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal archivage ════════════════════════════════════════════════ */}
      {archivingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setArchivingId(null)}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, minWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#991b1b' }}>Archiver le client</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>Cette action désactivera tous les imports. L'historique des KPI est conservé.</p>
            <textarea placeholder="Motif d'archivage (optionnel)" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} rows={3}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setArchivingId(null)} style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => archiveMutation.mutate({ id: archivingId, reason: archiveReason })} disabled={archiveMutation.isPending}
                style={{ padding: '6px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                {archiveMutation.isPending ? 'Archivage…' : "Confirmer l'archivage"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ Modal suppression definitive ═══════════════════════════════ */}
      {deletingClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setDeletingClient(null)}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, minWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#dc2626' }}>Supprimer definitivement</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>
              Cette action est <strong>irreversible</strong>. Toutes les donnees seront supprimees : issues, worklogs, KPI, imports, projets.
            </p>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 12px' }}>
              Pour confirmer, saisissez le nom du client : <strong>{deletingClient.name}</strong>
            </p>
            <input
              type="text" value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deletingClient.name}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #fca5a5', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletingClient(null)} style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Annuler</button>
              <button
                onClick={() => deleteMutation.mutate(deletingClient.id)}
                disabled={deleteConfirmName !== deletingClient.name || deleteMutation.isPending}
                style={{
                  padding: '6px 16px', background: deleteConfirmName === deletingClient.name ? '#dc2626' : '#e5e7eb',
                  color: deleteConfirmName === deletingClient.name ? 'white' : '#9ca3af',
                  border: 'none', borderRadius: 6, cursor: deleteConfirmName === deletingClient.name ? 'pointer' : 'not-allowed', fontWeight: 600,
                }}
              >
                {deleteMutation.isPending ? 'Suppression…' : 'Supprimer definitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ClientDetail ──────────────────────────────────────────────────────────────

function ClientDetail({
  client, onEdit, onArchive, onDelete, testMutation,
}: {
  client: Client;
  onEdit: () => void;
  onArchive: (id: number) => void;
  onDelete: (client: Client) => void;
  testMutation: ReturnType<typeof useMutation<{ ok: boolean; error?: string }, Error, number>>;
}) {
  const { data: projects } = useQuery<ProjectConfig[]>({
    queryKey: ['client-projects', client.id],
    queryFn: () => clientsApi.getProjects(client.id),
  });

  const [showAddProject, setShowAddProject] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{client.name}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => testMutation.mutate(client.id)} disabled={testMutation.isPending}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>
            {testMutation.isPending ? 'Test…' : 'Tester la connexion'}
          </button>
          <button onClick={onEdit}
            style={{ padding: '6px 14px', border: '1px solid #93c5fd', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Modifier
          </button>
          {client.status !== 'ARCHIVED' && (
            <button onClick={() => onArchive(client.id)}
              style={{ padding: '6px 14px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}>
              Archiver
            </button>
          )}
          {client.status === 'ARCHIVED' && (
            <button onClick={() => onDelete(client)}
              style={{ padding: '6px 14px', border: '1px solid #dc2626', borderRadius: 6, background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Supprimer definitivement
            </button>
          )}
        </div>
      </div>

      {testMutation.data && (
        <div style={{ padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontSize: 13, background: testMutation.data.ok ? '#d1fae5' : '#fee2e2', color: testMutation.data.ok ? '#065f46' : '#991b1b' }}>
          {testMutation.data.ok ? '✓ Connexion JIRA opérationnelle' : `✗ Erreur : ${testMutation.data.error}`}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 0', fontSize: 13, marginBottom: 24 }}>
        {[
          ['ID', String(client.id)],
          ['Statut', client.status === 'ACTIVE' ? 'Actif' : client.status],
          ['Champs JIRA extra', client.extraJiraFields?.join(', ') ?? '(aucun)'],
          ['Types retour interne', client.returnInternalIssueTypes?.join(', ') ?? '(non configuré)'],
          ['Types retour client', client.returnClientIssueTypes?.join(', ') ?? '(non configuré)'],
          ['Import transitions', client.importTransitions ? 'Activé' : 'Désactivé'],
          ['Créé le', new Date(client.createdAt).toLocaleDateString('fr-FR')],
        ].map(([label, value]) => (
          <React.Fragment key={label}>
            <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
            <span style={{ color: '#111827' }}>{value}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Projets */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#374151' }}>Projets JIRA</h3>
          <button onClick={() => setShowAddProject(true)}
            style={{ padding: '4px 12px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Ajouter un projet
          </button>
        </div>
        {!projects?.length ? (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>Aucun projet configuré.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {projects.map((p) => (
              <div key={p.jiraProjectKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>{p.jiraProjectKey}</span>
                  <span style={{ fontSize: 13, color: '#374151', marginLeft: 8 }}>{p.jiraProjectName}</span>
                  {p.importFromDate && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>depuis le {new Date(p.importFromDate).toLocaleDateString('fr-FR')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddProject && (
        <AddProjectModal
          clientId={client.id}
          onClose={() => setShowAddProject(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['client-projects', client.id] })}
        />
      )}

      {/* KPIs du client */}
      <ClientKpiSection clientId={client.id} />
    </div>
  );
}

// ─── Sous-composants ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: ModalStep }) {
  const steps = [
    { key: 'info', label: 'Informations' },
    { key: 'jira', label: 'Instance JIRA' },
    { key: 'recap', label: 'Confirmation' },
    { key: 'projects', label: 'Projets' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: i <= currentIdx ? '#4f94ef' : '#e5e7eb', color: i <= currentIdx ? 'white' : '#9ca3af' }}>
              {i < currentIdx ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: i <= currentIdx ? '#4f94ef' : '#9ca3af', textAlign: 'center' }}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ height: 2, flex: 1, background: i < currentIdx ? '#4f94ef' : '#e5e7eb', marginBottom: 18 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function RecapRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#6b7280', width: 110, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      <span style={{ wordBreak: 'break-all', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

function ModalActions({ onCancel, cancelLabel = 'Annuler', onNext, nextLabel, nextDisabled, nextColor = '#4f94ef' }: {
  onCancel: () => void; cancelLabel?: string;
  onNext: () => void; nextLabel: string; nextDisabled?: boolean; nextColor?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
      <button onClick={onCancel} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 }}>{cancelLabel}</button>
      <button onClick={onNext} disabled={nextDisabled}
        style={{ padding: '7px 20px', background: nextDisabled ? '#e5e7eb' : nextColor, color: nextDisabled ? '#9ca3af' : 'white', border: 'none', borderRadius: 6, cursor: nextDisabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
        {nextLabel}
      </button>
    </div>
  );
}

// ─── JiraFieldSelector ─────────────────────────────────────────────────────────

function JiraFieldSelector({ clientId, selected, onChange }: {
  clientId: number;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  const { data: fields, isLoading, error } = useQuery<JiraFieldInfo[]>({
    queryKey: ['jira-fields', clientId],
    queryFn: () => clientsApi.getJiraFields(clientId),
    staleTime: 5 * 60_000,
  });

  const filtered = (fields ?? []).filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.id.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        Champs JIRA supplémentaires
      </label>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
        Champs présents dans les projets du client. Stockés dans <code>Issue.customFields</code> — utilisables dans les formules KPI.
      </div>

      {isLoading && <div style={{ fontSize: 13, color: '#6b7280' }}>Chargement des champs JIRA…</div>}
      {error && <div style={{ fontSize: 13, color: '#991b1b' }}>Impossible de charger les champs (projet non configuré ou connexion invalide).</div>}

      {fields && (
        <>
          <input
            type="text"
            placeholder="Rechercher par nom ou ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <div style={{ border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>Aucun champ trouvé.</div>
            )}
            {filtered.map((f) => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', background: selected.includes(f.id) ? '#eff6ff' : 'white' }}>
                <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8, fontFamily: 'monospace' }}>{f.id}</span>
                  {f.custom && <span style={{ fontSize: 10, marginLeft: 6, background: '#f3f4f6', color: '#6b7280', borderRadius: 3, padding: '1px 5px' }}>custom</span>}
                </div>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#4f94ef' }}>
              {selected.length} champ{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''} : {selected.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 10px',
  borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, boxSizing: 'border-box', outline: 'none',
};
