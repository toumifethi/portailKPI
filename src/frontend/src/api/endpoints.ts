import { apiClient } from './client';
import type {
  DashboardKpi,
  KpiEvolutionPoint,
  CrossClientData,
  Client,
  ImportJob,
  ImportError,
  ImportSchedule,
  Collaborator,
  JiraUser,
  KpiDefinition,
  KpiClientConfig,
  KpiDebugTrace,
  ProjectConfig,
  JiraProjectOption,
  JiraConnection,
  JiraFieldInfo,
  IssueRow,
  WorklogRow,
  PaginatedResponse,
  KpiByUserRow,
  MyKpiClient,
  MetricInfo,
  FormulaValidationResult,
  FormulaTestResult,
  JiraCustomFieldInfo,
  ProfileRef,
  KpiSourceIssue,
  IssueWorklogDetail,
  KpiCalcSchedule,
  JobLog,
  JiraUserCandidatesResponse,
  JiraUsersSyncResult,
  TransitionRow,
} from '@/types';

// --- Dashboard ---

export const dashboardApi = {
  getKpis: (clientId: number, period: string, periodType = 'MONTHLY') =>
    apiClient
      .get<DashboardKpi[]>('/dashboard/kpis', { params: { clientId, period, periodType } })
      .then((r) => r.data),

  getEvolution: (clientId: number, kpiClientConfigId: number, periods = 13) =>
    apiClient
      .get<KpiEvolutionPoint[]>('/dashboard/evolution', {
        params: { clientId, kpiClientConfigId, periods },
      })
      .then((r) => r.data),

  getCrossClient: (kpiDefinitionId: number, periods = 13) =>
    apiClient
      .get<CrossClientData>('/dashboard/cross-client', { params: { kpiDefinitionId, periods } })
      .then((r) => r.data),

  getKpisByUser: (clientId: number, period: string) =>
    apiClient
      .get<KpiByUserRow[]>('/dashboard/kpis-by-user', { params: { clientId, period } })
      .then((r) => r.data),

  getMyKpis: (period: string) =>
    apiClient.get<MyKpiClient[]>('/dashboard/my-kpis', { params: { period } }).then((r) => r.data),

  getEvolutionByUser: (collaboratorId: number, kpiClientConfigId: number, periods = 6) =>
    apiClient
      .get('/dashboard/evolution-by-user', { params: { collaboratorId, kpiClientConfigId, periods } })
      .then((r) => r.data),

  getTeamHeatmap: (clientId: number, period: string) =>
    apiClient
      .get('/dashboard/team-heatmap', { params: { clientId, period } })
      .then((r) => r.data),

  getTeamHeatmapHistory: (clientId: number, kpiClientConfigId: number, periods = 6) =>
    apiClient
      .get('/dashboard/team-heatmap-history', { params: { clientId, kpiClientConfigId, periods } })
      .then((r) => r.data),

  getLastUpdate: (clientId: number) =>
    apiClient
      .get<{ lastUpdate: string | null; issuesFetched: number; worklogsFetched: number }>('/dashboard/last-update', { params: { clientId } })
      .then((r) => r.data),
};

// --- Jira Connections ---

export const jiraConnectionsApi = {
  list: () => apiClient.get<JiraConnection[]>('/jira-connections').then((r) => r.data),
  create: (data: { name: string; jiraUrl: string; jiraEmail: string; jiraApiToken: string; tempoApiToken?: string; fieldMapping?: { storyPoints?: string; sprints?: string } }) =>
    apiClient.post<JiraConnection>('/jira-connections', data).then((r) => r.data),
  test: (data: { jiraUrl: string; jiraEmail: string; jiraApiToken: string }) =>
    apiClient.post<{ ok: boolean; error?: string; user?: string }>('/jira-connections/test', data).then((r) => r.data),
  testExisting: (id: number) =>
    apiClient.get<{ ok: boolean; error?: string; user?: string }>(`/jira-connections/${id}/test`).then((r) => r.data),
  update: (id: number, data: { name: string; jiraUrl: string; jiraEmail: string; jiraApiToken?: string; tempoApiToken?: string; fieldMapping?: { storyPoints?: string; sprints?: string } }) =>
    apiClient.patch<JiraConnection>(`/jira-connections/${id}`, data).then((r) => r.data),
  remove: (id: number) =>
    apiClient.delete(`/jira-connections/${id}`).then((r) => r.data),
  getFields: (id: number) =>
    apiClient.get<Array<{ id: string; name: string; fieldType: string; schemaType: string }>>(`/jira-connections/${id}/fields`).then((r) => r.data),
  getIssueTypes: (id: number) =>
    apiClient.get<string[]>(`/jira-connections/${id}/issue-types`).then((r) => r.data),
  syncFields: (id: number) =>
    apiClient.post<{ ok: boolean; fieldsSync: number; optionsSync: number }>(`/jira-connections/${id}/sync-fields`).then((r) => r.data),
};

// --- Clients ---

export const clientsApi = {
  list: (includeArchived = false) => apiClient.get<Client[]>(`/clients${includeArchived ? '?includeArchived=true' : ''}`).then((r) => r.data),
  remove: (id: number) => apiClient.delete<{ ok: boolean; message: string }>(`/clients/${id}`).then((r) => r.data),
  get: (id: number) => apiClient.get<Client>(`/clients/${id}`).then((r) => r.data),
  create: (data: { name: string; jiraConnectionId: number; returnInternalIssueTypes?: string[] | null; returnClientIssueTypes?: string[] | null; importTransitions?: boolean }) =>
    apiClient.post<Client>('/clients', data).then((r) => r.data),
  update: (id: number, data: { name?: string; jiraConnectionId?: number; extraJiraFields?: string[] | null; returnInternalIssueTypes?: string[] | null; returnClientIssueTypes?: string[] | null; importTransitions?: boolean }) =>
    apiClient.patch<Client>(`/clients/${id}`, data).then((r) => r.data),
  testConnection: (id: number) =>
    apiClient.post<{ ok: boolean; error?: string }>(`/clients/${id}/test-connection`).then((r) => r.data),
  archive: (id: number, reason?: string) =>
    apiClient.patch<Client>(`/clients/${id}/archive`, { reason }).then((r) => r.data),
  getProjects: (id: number) =>
    apiClient.get<ProjectConfig[]>(`/clients/${id}/projects`).then((r) => r.data),
  getJiraProjects: (id: number) =>
    apiClient.get<JiraProjectOption[]>(`/clients/${id}/jira-projects`).then((r) => r.data),
  getJiraFields: (id: number) =>
    apiClient.get<JiraFieldInfo[]>(`/clients/${id}/jira-fields`).then((r) => r.data),
  addProject: (id: number, data: { jiraProjectKey: string; jiraProjectName: string; importFromDate?: string; jiraProjectType?: string }) =>
    apiClient.post<ProjectConfig>(`/clients/${id}/projects`, data).then((r) => r.data),
  removeProject: (id: number, jiraProjectKey: string) =>
    apiClient.delete(`/clients/${id}/projects/${jiraProjectKey}`).then((r) => r.data),
  getCustomFields: (id: number) =>
    apiClient.get<JiraCustomFieldInfo[]>(`/clients/${id}/custom-fields`).then((r) => r.data),
  getIssueTypes: (id: number) =>
    apiClient.get<{ issueTypes: string[]; hasProjects: boolean; message: string | null }>(`/clients/${id}/issue-types`).then((r) => r.data),
};

// --- KPI ---

export const kpiApi = {
  getDefinitions: () =>
    apiClient.get<KpiDefinition[]>('/kpi/definitions').then((r) => r.data),
  createDefinition: (data: {
    name: string;
    description?: string;
    unit?: string;
    formulaType: string;
    predefinedType?: string;
    baseConfig?: Record<string, unknown>;
    formulaAst?: Record<string, unknown>;
    targetProfileIds?: number[];
    [key: string]: unknown;
  }) => apiClient.post<KpiDefinition>('/kpi/definitions', data).then((r) => r.data),
  updateDefinition: (id: number, data: Partial<KpiDefinition> & { formulaAst?: unknown }) =>
    apiClient.patch<KpiDefinition>(`/kpi/definitions/${id}`, data).then((r) => r.data),
  deleteDefinition: (id: number) =>
    apiClient.delete(`/kpi/definitions/${id}`).then((r) => r.data),
  duplicateDefinition: (id: number) =>
    apiClient.post<KpiDefinition>(`/kpi/definitions/${id}/duplicate`).then((r) => r.data),
  getConfigs: (clientId: number) =>
    apiClient.get<KpiClientConfig[]>('/kpi/configs', { params: { clientId } }).then((r) => r.data),
  updateConfig: (id: number, data: Partial<KpiClientConfig>) =>
    apiClient.patch<KpiClientConfig>(`/kpi/configs/${id}`, data).then((r) => r.data),
  assignToClient: (clientId: number, kpiDefinitionId: number) =>
    apiClient.post<KpiClientConfig>('/kpi/configs', { clientId, kpiDefinitionId }).then((r) => r.data),
  removeConfig: (id: number) =>
    apiClient.delete(`/kpi/configs/${id}`).then((r) => r.data),
  recalculate: (params: { clientId?: number; period?: string; allClients?: boolean }) =>
    apiClient.post<{ ok: boolean; message: string }>('/kpi/recalculate', params).then((r) => r.data),
  getSourceIssues: (kpiClientConfigId: number, period: string, collaboratorId?: number) =>
    apiClient.get<KpiSourceIssue[]>('/kpi/source-issues', {
      params: { kpiClientConfigId, period, ...(collaboratorId ? { collaboratorId } : {}) },
    }).then((r) => r.data),
  getIssueWorklogs: (issueId: number, period?: string) =>
    apiClient.get<{
      worklogs: IssueWorklogDetail[];
      totals: { periodSeconds: number; periodHours: number; allTimeSeconds: number; allTimeHours: number; worklogCountPeriod: number; worklogCountAllTime: number; childIssueCount: number };
    }>('/kpi/issue-worklogs', { params: { issueId, ...(period ? { period } : {}) } }).then((r) => r.data),
  getMetrics: () =>
    apiClient.get<MetricInfo[]>('/kpi/metrics').then((r) => r.data),
  validateFormula: (formulaAst: unknown) =>
    apiClient.post<FormulaValidationResult>('/kpi/validate-formula', formulaAst).then((r) => r.data),
  testFormula: (formulaAst: unknown, clientId: number, period: string) =>
    apiClient.post<FormulaTestResult>('/kpi/test-formula', { formulaAst, clientId, period }).then((r) => r.data),

  // Debug traces
  getDebugTraces: (kpiClientConfigId: number, params?: { period?: string; collaboratorId?: number }) =>
    apiClient.get<KpiDebugTrace[]>('/kpi/debug-traces', {
      params: { kpiClientConfigId, ...params },
    }).then((r) => r.data),
  deleteDebugTraces: (kpiClientConfigId: number) =>
    apiClient.delete<{ ok: boolean; deleted: number }>('/kpi/debug-traces', {
      params: { kpiClientConfigId },
    }).then((r) => r.data),
};

// --- App Settings ---

export const settingsApi = {
  getAll: () =>
    apiClient.get<Array<{ key: string; value: string; description: string | null }>>('/settings').then((r) => r.data),
  update: (key: string, value: string, description?: string) =>
    apiClient.patch<{ key: string; value: string }>(`/settings/${encodeURIComponent(key)}`, { value, description }).then((r) => r.data),
};

// --- Imports ---

export const importsApi = {
  list: (clientId: number, limit = 20) =>
    apiClient.get<ImportJob[]>('/imports', { params: { clientId, limit } }).then((r) => r.data),
  trigger: (clientId: number, periodStart?: string, periodEnd?: string, jql?: string) =>
    apiClient
      .post<{ importJobId: number; status: string }>('/imports/trigger', {
        clientId,
        periodStart,
        periodEnd,
        jql,
      })
      .then((r) => r.data),
  get: (id: number) => apiClient.get<ImportJob & { errors: ImportError[] }>(`/imports/${id}`).then((r) => r.data),
  retry: (id: number) =>
    apiClient.post<{ importJobId: number; status: string }>(`/imports/${id}/retry`).then((r) => r.data),
  getJiraUserCandidates: (clientId: number, params?: { page?: number; pageSize?: number; search?: string; projectKeys?: string[]; groupNames?: string[] }) =>
    apiClient
      .get<JiraUserCandidatesResponse>('/imports/jira-users-candidates', {
        params: {
          clientId,
          ...(params?.page ? { page: params.page } : {}),
          ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
          ...(params?.search ? { search: params.search } : {}),
          ...(params?.projectKeys && params.projectKeys.length > 0 ? { projectKeys: params.projectKeys.join(',') } : {}),
          ...(params?.groupNames && params.groupNames.length > 0 ? { groupNames: params.groupNames.join(',') } : {}),
        },
      })
      .then((r) => r.data),
  excludeJiraUser: (data: { clientId: number; accountId: string; displayName?: string; emailAddress?: string | null }) =>
    apiClient.post<{ ok: boolean }>('/imports/jira-users-exclusions', data).then((r) => r.data),
  syncJiraUsers: (clientId: number, accountIds?: string[]) =>
    apiClient.post<JiraUsersSyncResult>('/imports/sync-jira-users', { clientId, accountIds }).then((r) => r.data),
  getJiraConnectionUserCandidates: (jiraConnectionId: number, params?: { page?: number; pageSize?: number; search?: string; projectKeys?: string[]; groupNames?: string[] }) =>
    apiClient
      .get<JiraUserCandidatesResponse>('/imports/jira-connection-users-candidates', {
        params: {
          jiraConnectionId,
          ...(params?.page ? { page: params.page } : {}),
          ...(params?.pageSize ? { pageSize: params.pageSize } : {}),
          ...(params?.search ? { search: params.search } : {}),
          ...(params?.projectKeys && params.projectKeys.length > 0 ? { projectKeys: params.projectKeys.join(',') } : {}),
          ...(params?.groupNames && params.groupNames.length > 0 ? { groupNames: params.groupNames.join(',') } : {}),
        },
      })
      .then((r) => r.data),
  excludeJiraConnectionUser: (data: { jiraConnectionId: number; accountId: string; displayName?: string; emailAddress?: string | null }) =>
    apiClient.post<{ ok: boolean }>('/imports/jira-connection-users-exclusions', data).then((r) => r.data),
  syncJiraConnectionUsers: (jiraConnectionId: number, accountIds?: string[]) =>
    apiClient.post<JiraUsersSyncResult>('/imports/sync-jira-connection-users', { jiraConnectionId, accountIds }).then((r) => r.data),
};

// --- Import Schedules ---

export const importSchedulesApi = {
  list: (clientId?: number) =>
    apiClient.get<ImportSchedule[]>('/import-schedules', { params: clientId ? { clientId } : {} }).then((r) => r.data),
  create: (data: { clientId: number; cronExpression: string; periodMode?: string; isActive?: boolean }) =>
    apiClient.post<ImportSchedule>('/import-schedules', data).then((r) => r.data),
  update: (id: number, data: { cronExpression?: string; isActive?: boolean; periodMode?: string }) =>
    apiClient.patch<ImportSchedule>(`/import-schedules/${id}`, data).then((r) => r.data),
  remove: (id: number) =>
    apiClient.delete(`/import-schedules/${id}`).then((r) => r.data),
};

// --- KPI Calc Schedules ---

export const kpiCalcSchedulesApi = {
  list: (clientId?: number) =>
    apiClient.get<KpiCalcSchedule[]>('/kpi-calc-schedules', { params: clientId ? { clientId } : {} }).then((r) => r.data),
  create: (data: { clientId?: number; kpiDefinitionId?: number; cronExpression: string; periodMode?: string; allClients?: boolean }) =>
    apiClient.post<KpiCalcSchedule>('/kpi-calc-schedules', data).then((r) => r.data),
  update: (id: number, data: { cronExpression?: string; isActive?: boolean; periodMode?: string; allClients?: boolean; kpiDefinitionId?: number }) =>
    apiClient.patch<KpiCalcSchedule>(`/kpi-calc-schedules/${id}`, data).then((r) => r.data),
  remove: (id: number) =>
    apiClient.delete(`/kpi-calc-schedules/${id}`).then((r) => r.data),
};

// --- Maintenance ---

export const maintenanceApi = {
  purgePreview: (data: { beforeDate: string; clientId?: number; types: string[] }) =>
    apiClient.post<{ beforeDate: string; clientId: number | null; counts: Record<string, number> }>('/maintenance/purge/preview', data).then((r) => r.data),
  purgeExecute: (data: { beforeDate: string; clientId?: number; types: string[] }) =>
    apiClient.post<{ ok: boolean; deleted: Record<string, number> }>('/maintenance/purge/execute', data).then((r) => r.data),
};

// --- Job Logs ---

export const jobLogsApi = {
  list: (params?: { jobType?: string; clientId?: number; limit?: number; offset?: number }) =>
    apiClient.get<{ data: JobLog[]; total: number; limit: number; offset: number }>('/job-logs', { params }).then((r) => r.data),
};

// --- Issues ---

export const issuesApi = {
  list: (params: {
    clientId?: number;
    projectId?: number;
    status?: string;
    issueType?: string;
    assigneeAccountId?: string;
    jiraKey?: string;
    periodStart?: string;
    periodEnd?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<IssueRow>>('/issues', { params })
      .then((r) => r.data),
  listTypes: () =>
    apiClient.get<string[]>('/issues/types').then((r) => r.data),
  listStatuses: () =>
    apiClient.get<string[]>('/issues/statuses').then((r) => r.data),
};

// --- Worklogs ---

export const worklogsApi = {
  list: (params: {
    clientId?: number;
    authorAccountId?: string;
    periodStart?: string;
    periodEnd?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<WorklogRow>>('/worklogs', { params })
      .then((r) => r.data),
};

// --- Profiles ---

export const profilesApi = {
  list: () => apiClient.get<ProfileRef[]>('/profiles').then((r) => r.data),
  create: (data: { code: string; label: string; description?: string; level?: number }) =>
    apiClient.post<ProfileRef>('/profiles', data).then((r) => r.data),
  update: (id: number, data: Partial<ProfileRef>) =>
    apiClient.patch<ProfileRef>(`/profiles/${id}`, data).then((r) => r.data),
  remove: (id: number) =>
    apiClient.delete(`/profiles/${id}`).then((r) => r.data),
};

// --- Collaborators (admin) ---

export const collaboratorsApi = {
  list: (params?: { search?: string; clientId?: number }) =>
    apiClient.get<Collaborator[]>('/collaborators', {
      params: { ...(params?.search ? { search: params.search } : {}), ...(params?.clientId ? { clientId: params.clientId } : {}) },
    }).then((r) => r.data),
  update: (id: number, data: Partial<Collaborator>) =>
    apiClient.patch<Collaborator>(`/collaborators/${id}`, data).then((r) => r.data),
  create: (data: { email: string; firstName: string; lastName: string; profileId: number }) =>
    apiClient.post<Collaborator>('/collaborators', data).then((r) => r.data),
  addScope: (id: number, scopeType: string, scopeId: number) =>
    apiClient.post(`/collaborators/${id}/scopes`, { scopeType, scopeId }).then((r) => r.data),
  removeScope: (id: number, scopeId: number) =>
    apiClient.delete(`/collaborators/${id}/scopes/${scopeId}`).then((r) => r.data),
};

// --- JIRA Users ---

// --- Issue Links (Returns Analysis) ---

export const issueLinksApi = {
  returnsSummary: (params: { clientId: number; periodStart?: string; periodEnd?: string; projectId?: number; assigneeAccountId?: string; page?: number; limit?: number }) =>
    apiClient.get('/issue-links/returns-summary', { params }).then(r => r.data),
  returnsDetail: (issueId: number) =>
    apiClient.get('/issue-links/returns-detail', { params: { issueId } }).then(r => r.data),
};

export const jiraUsersApi = {
  list: (clientId?: number) =>
    apiClient.get<JiraUser[]>('/jira-users', { params: clientId ? { clientId } : {} }).then((r) => r.data),
  linkToCollaborator: (id: number, collaboratorId: number | null) =>
    apiClient.patch<JiraUser>(`/jira-users/${id}`, { collaboratorId }).then((r) => r.data),
  update: (id: number, data: { isActive?: boolean; displayName?: string; emailAddress?: string | null; collaboratorId?: number | null }) =>
    apiClient.patch<JiraUser>(`/jira-users/${id}`, data).then((r) => r.data),
};

// --- Transitions ---

export const transitionsApi = {
  list: (params: {
    clientId?: number;
    projectId?: number;
    jiraKey?: string;
    fromStatus?: string;
    toStatus?: string;
    assignee?: string;
    issueType?: string;
    periodStart?: string;
    periodEnd?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<TransitionRow>>('/transitions', { params })
      .then((r) => r.data),
  statuses: (clientId?: number) =>
    apiClient
      .get<{ fromStatuses: string[]; toStatuses: string[] }>('/transitions/statuses', { params: clientId ? { clientId } : {} })
      .then((r) => r.data),
  statusesByJiraConnection: (jiraConnectionId: number) =>
    apiClient
      .get<{ fromStatuses: string[]; toStatuses: string[] }>(`/transitions/statuses/by-jira-connection/${jiraConnectionId}`)
      .then((r) => r.data),
};
