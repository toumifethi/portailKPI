import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/api/endpoints';
import type { JiraProjectOption } from '@/types';

export interface AddProjectModalProps {
  clientId: number;
  onClose: () => void;
  onAdded: () => void;
}

export function AddProjectModal({ clientId, onClose, onAdded }: AddProjectModalProps) {
  const [mode, setMode] = useState<'jira' | 'manual'>('jira');
  const [selectedProject, setSelectedProject] = useState<JiraProjectOption | null>(null);
  const [manualKey, setManualKey] = useState('');
  const [manualName, setManualName] = useState('');
  const [importFromDate, setImportFromDate] = useState('');
  const queryClient = useQueryClient();

  const { data: jiraProjects, isLoading: loadingJira, isError: jiraError } = useQuery({
    queryKey: ['jira-projects', clientId],
    queryFn: () => clientsApi.getJiraProjects(clientId),
    retry: 1,
  });

  React.useEffect(() => {
    if (jiraError) setMode('manual');
  }, [jiraError]);

  const projectKey = mode === 'jira' ? selectedProject?.key ?? '' : manualKey.trim().toUpperCase();
  const projectName = mode === 'jira' ? selectedProject?.name ?? '' : manualName.trim();
  const projectType = mode === 'jira'
    ? (selectedProject?.projectTypeKey?.toUpperCase() === 'NEXT_GEN' ? 'NEXT_GEN' : 'CLASSIC')
    : 'CLASSIC';

  const canAdd = !!projectKey && !!projectName;

  const addMutation = useMutation({
    mutationFn: () =>
      clientsApi.addProject(clientId, {
        jiraProjectKey: projectKey,
        jiraProjectName: projectName,
        importFromDate: importFromDate || undefined,
        jiraProjectType: projectType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-projects', clientId] });
      onAdded();
      onClose();
    },
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Ajouter un projet</h3>

        <div style={{ display: 'flex', gap: 0, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          {(['jira', 'manual'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', fontSize: 12, background: mode === m ? '#4f94ef' : 'white', color: mode === m ? 'white' : '#374151', fontWeight: mode === m ? 600 : 400 }}>
              {m === 'jira' ? '📋 Choisir depuis JIRA' : '✏️ Saisie manuelle'}
            </button>
          ))}
        </div>

        {mode === 'jira' && (
          <>
            {loadingJira && <div style={{ color: '#6b7280', fontSize: 14 }}>Chargement des projets JIRA…</div>}
            {jiraError && <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>Impossible de récupérer les projets JIRA. Utilisez la saisie manuelle.</div>}
            {!loadingJira && !jiraError && (
              <div style={{ overflowY: 'auto', maxHeight: 240, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #e5e7eb', borderRadius: 6, padding: 6 }}>
                {jiraProjects?.map((p) => (
                  <div key={p.key} onClick={() => setSelectedProject(p)} style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', background: selectedProject?.key === p.key ? '#dbeafe' : '#f9fafb', border: selectedProject?.key === p.key ? '1px solid #93c5fd' : '1px solid transparent' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1d4ed8' }}>{p.key}</span>
                    <span style={{ fontSize: 13, color: '#374151', marginLeft: 8 }}>{p.name}</span>
                  </div>
                ))}
                {!jiraProjects?.length && <div style={{ color: '#9ca3af', fontSize: 13, padding: 8 }}>Aucun projet trouvé. Essayez la saisie manuelle.</div>}
              </div>
            )}
          </>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Clé du projet JIRA *</label>
              <input autoFocus type="text" value={manualKey} onChange={(e) => setManualKey(e.target.value)} placeholder="Ex. : MYPROJ" style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', textTransform: 'uppercase' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nom du projet *</label>
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ex. : Mon Projet" style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Importer depuis le (optionnel)</label>
          <input type="date" value={importFromDate} onChange={(e) => setImportFromDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>Annuler</button>
          <button onClick={() => addMutation.mutate()} disabled={!canAdd || addMutation.isPending} style={{ padding: '7px 16px', background: canAdd ? '#4f94ef' : '#d1d5db', color: 'white', border: 'none', borderRadius: 6, cursor: canAdd ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
            {addMutation.isPending ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
