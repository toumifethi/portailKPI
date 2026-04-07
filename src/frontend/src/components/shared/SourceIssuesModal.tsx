import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kpiApi } from '@/api/endpoints';

// ── Modal détail des tickets source ──

export function SourceIssuesModal({
  clientId,
  collaboratorId,
  collaboratorName,
  kpiName,
  period,
  onClose,
}: {
  clientId: number;
  collaboratorId?: number;
  collaboratorName?: string;
  kpiName: string;
  period: string;
  onClose: () => void;
}) {
  const { data: configs } = useQuery({
    queryKey: ['kpi-configs', clientId],
    queryFn: () => kpiApi.getConfigs(clientId),
  });

  const config = configs?.find((c) => c.kpiDefinition?.name === kpiName);

  const { data: issues, isLoading } = useQuery({
    queryKey: ['kpi-source-issues', config?.id, collaboratorId, period],
    queryFn: () => kpiApi.getSourceIssues(config!.id, period, collaboratorId),
    enabled: !!config,
  });

  const [worklogIssueId, setWorklogIssueId] = useState<number | null>(null);

  function fmtH(hours: number | null): string {
    if (hours === null || hours === 0) return '—';
    return `${Math.round(hours * 10) / 10}h`;
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 1100, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Tickets source{collaboratorName ? ` — ${collaboratorName}` : ' — Tous'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              KPI : {kpiName} — Periode : {period} — {issues?.length ?? '...'} ticket(s)
              {issues && issues.length > 0 && (
                <span style={{ marginLeft: 12 }}>
                  Estime : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupEstimateHours ?? 0), 0) * 10) / 10}h</strong>
                  {' — '}
                  Consomme : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupTimeSpentHours ?? 0), 0) * 10) / 10}h</strong>
                  {' — '}
                  Restant : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupRemainingHours ?? 0), 0) * 10) / 10}h</strong>
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {isLoading && <div style={{ padding: 32, color: '#6b7280', textAlign: 'center' }}>Chargement...</div>}

        {issues && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                  {['Cle', 'Resume', 'Type', 'Statut', 'Assigne', 'Estime (rollup)', 'Consomme (rollup)', 'Restant (rollup)'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#4f94ef', fontSize: 11 }}>{issue.jiraKey}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue.summary}>
                        {issue.summary}
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#f3f4f6', color: '#374151' }}>{issue.issueType}</span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#dbeafe', color: '#1d4ed8' }}>{issue.status}</span>
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>{issue.assigneeDisplayName ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtH(issue.rollupEstimateHours)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 500 }}>
                      {issue.rollupTimeSpentHours ? (
                        <button
                          onClick={() => setWorklogIssueId(issue.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', textDecoration: 'underline', fontWeight: 500, fontSize: 12 }}
                        >
                          {fmtH(issue.rollupTimeSpentHours)}
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#9333ea' }}>{fmtH(issue.rollupRemainingHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Modal worklogs */}
        {worklogIssueId && (
          <WorklogDetailModal issueId={worklogIssueId} period={period} onClose={() => setWorklogIssueId(null)} />
        )}
      </div>
    </div>
  );
}

// ── Modal worklogs détaillés ──

export function WorklogDetailModal({ issueId, period, onClose }: { issueId: number; period?: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['issue-worklogs', issueId, period],
    queryFn: () => kpiApi.getIssueWorklogs(issueId, period),
  });

  const worklogs = data?.worklogs ?? [];
  const outsideWorklogs = (data as unknown as { outsideWorklogs?: typeof worklogs })?.outsideWorklogs ?? [];
  const totals = data?.totals;

  function fmtDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 800, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Worklogs detailles</h3>
            {totals && (
              <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
                <span style={{ color: '#065f46', fontWeight: 600, background: '#d1fae5', padding: '2px 8px', borderRadius: 4 }}>
                  Periode ({period}) : {totals.periodHours}h ({totals.worklogCountPeriod} worklogs)
                </span>
                <span style={{ color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>
                  Total historique : {totals.allTimeHours}h ({totals.worklogCountAllTime} worklogs)
                </span>
                {totals.childIssueCount > 0 && (
                  <span style={{ color: '#5b21b6', background: '#ede9fe', padding: '2px 8px', borderRadius: 4 }}>
                    {totals.childIssueCount} sous-tache(s) incluse(s)
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {isLoading && <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>Chargement...</div>}

        {worklogs.length > 0 && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                  {['Date', 'Ticket', 'Sous-tache', 'Auteur', 'Temps', 'Source'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worklogs.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: 11 }}>
                      {new Date(w.startedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#4f94ef', fontSize: 11 }}>
                      {w.issueKey}
                    </td>
                    <td style={{ padding: '5px 10px', maxWidth: 200 }}>
                      {w.isSubtask ? (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={w.issueSummary ?? ''}>
                          {w.issueSummary}
                        </div>
                      ) : <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '5px 10px', fontSize: 11 }}>{w.authorDisplayName}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 11 }}>{fmtDuration(w.timeSpentSeconds)}</td>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                        background: w.source === 'TEMPO' ? '#ede9fe' : '#f3f4f6',
                        color: w.source === 'TEMPO' ? '#5b21b6' : '#6b7280',
                      }}>{w.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && worklogs.length === 0 && (
          <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>Aucun worklog sur cette periode.</div>
        )}

        {/* Total période */}
        {worklogs.length > 0 && (
          <div style={{ padding: '8px 12px', background: '#d1fae5', borderRadius: 4, fontSize: 12, color: '#065f46', fontWeight: 600, marginTop: 8 }}>
            Total periode : {fmtDuration(worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0))} ({worklogs.length} worklogs)
          </div>
        )}

        {/* Section hors période */}
        {outsideWorklogs.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
              Hors periode ({outsideWorklogs.length} worklogs)
            </div>
            <div style={{ overflow: 'auto', opacity: 0.7 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    {['Date', 'Ticket', 'Sous-tache', 'Auteur', 'Temps', 'Source'].map((h) => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outsideWorklogs.map((w) => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: '#9ca3af', fontSize: 11 }}>
                        {new Date(w.startedAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#9ca3af', fontSize: 11 }}>{w.issueKey}</td>
                      <td style={{ padding: '5px 10px', maxWidth: 200 }}>
                        {w.isSubtask ? (
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#9ca3af' }} title={w.issueSummary ?? ''}>
                            {w.issueSummary}
                          </div>
                        ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 10px', fontSize: 11, color: '#9ca3af' }}>{w.authorDisplayName}</td>
                      <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 11, color: '#9ca3af' }}>{fmtDuration(w.timeSpentSeconds)}</td>
                      <td style={{ padding: '5px 10px' }}>
                        <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: '#f3f4f6', color: '#9ca3af' }}>{w.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 12px', background: '#f3f4f6', borderRadius: 4, fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 4 }}>
              Total hors periode : {fmtDuration(outsideWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0))} ({outsideWorklogs.length} worklogs)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
