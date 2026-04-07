// --- Domain types mirroring backend ---

export type PeriodType = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export interface ProfileRef {
  id: number;
  code: string;
  label: string;
  description: string | null;
  level: number;
  isActive: boolean;
}
export type CollaboratorStatus = 'ACTIF' | 'INACTIF' | 'EXCLU';
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ImportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
export type RagStatus = 'RED' | 'ORANGE' | 'GREEN' | 'NEUTRAL';

export interface DashboardKpi {
  kpiId: number;
  kpiName: string;
  unit: string | null;
  value: number | null;
  ticketCount: number | null;
  excludedTicketCount: number | null;
  thresholdRedMin: number | null;
  thresholdRedMax: number | null;
  thresholdOrangeMin: number | null;
  thresholdOrangeMax: number | null;
  thresholdGreenMin: number | null;
  thresholdGreenMax: number | null;
  period: string;
  computedAt: string;
  formulaVersion: string;
}

export interface KpiEvolutionPoint {
  period: string;
  value: number | null;
  ticketCount: number | null;
}

export interface CrossClientData {
  periods: string[];
  clients: Array<{
    clientId: number;
    clientName: string;
    logoUrl: string | null;
    series: Array<{ period: string; value: number | null }>;
  }>;
}

export interface JiraFieldMapping {
  storyPoints?: string;
  sprints?: string;
  returnLinkType?: string;
}

export interface JiraConnection {
  id: number;
  name: string;
  jiraUrl: string;
  jiraEmail: string;
  tempoApiToken: string | null;
  fieldMapping: JiraFieldMapping | null;
  createdAt: string;
  updatedAt: string;
  _count?: { clients: number };
}

export interface Client {
  id: number;
  name: string;
  status: ClientStatus;
  jiraConnectionId: number | null;
  extraJiraFields: string[] | null;
  returnInternalIssueTypes: string[] | null;
  returnClientIssueTypes: string[] | null;
  importTransitions: boolean;
  jiraConnection?: JiraConnection;
  createdAt: string;
  projects?: ProjectConfig[];
}

export interface Project {
  id: number;
  clientId: number;
  name: string;
  jiraProjectKey: string | null;
  status: string;
}

export interface JiraFieldInfo {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type: string; custom?: string; items?: string };
  allowedValues?: Array<{ id: string; value?: string; name?: string }>;
}

export interface JiraCustomFieldInfo {
  id: string;
  name: string;
  fieldType: string;
  schemaType: string | null;
  options: Array<{ id: string; value: string }>;
}

export interface ProjectConfig {
  id: number;
  clientId: number;
  jiraProjectKey: string;
  jiraProjectName: string;
  jiraProjectType: string;
  status: string;
  importFromDate: string | null;
  lastSyncAt: string | null;
}

export interface JiraProjectOption {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface KpiDefinition {
  id: number;
  name: string;
  description: string | null;
  unit: string | null;
  formulaType: string;
  predefinedType: string | null;
  isSystem: boolean;
}

export interface KpiClientConfig {
  id: number;
  clientId: number;
  kpiDefinitionId: number;
  isActive: boolean;
  debugMode: boolean;
  debugCollaboratorId: number | null;
  configOverride: Record<string, unknown> | null;
  formulaOverride: string | null;
  formulaVersion: string;
  thresholdRedMin: number | null;
  thresholdRedMax: number | null;
  thresholdOrangeMin: number | null;
  thresholdOrangeMax: number | null;
  thresholdGreenMin: number | null;
  thresholdGreenMax: number | null;
  kpiDefinition?: KpiDefinition;
}

export interface KpiDebugTrace {
  id: number;
  kpiClientConfigId: number;
  periodStart: string;
  periodEnd: string;
  collaboratorId: number | null;
  collaboratorName: string | null;
  resolvedConfig: Record<string, unknown>;
  filtersApplied: Record<string, unknown>;
  metrics: Array<{
    metric: string;
    queries: Array<{ sql: string; params: string; duration_ms: number }>;
    rowCount: number | null;
    aggregatedValue: number | null;
    duration_ms: number;
  }>;
  formulaSteps: string;
  result: number | null;
  ticketCount: number;
  computedAt: string;
}

export interface ImportError {
  id: number;
  errorCode: string;
  errorType: 'BLOCKING' | 'NON_BLOCKING';
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface ImportJob {
  id: number;
  clientId: number;
  type: string;
  status: ImportStatus;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  issuesFetched: number;
  worklogsFetched: number;
  errorCount: number;
  createdAt: string;
  errors?: ImportError[];
}

export interface ImportSchedule {
  id: number;
  clientId: number | null;
  cronExpression: string;
  periodMode: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  client?: { id: number; name: string } | null;
}

// ── Collaborateurs (personnes Decade) ──

export interface Collaborator {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  profileId: number;
  profile?: ProfileRef;
  status: CollaboratorStatus;
  azureAdOid: string | null;
  createdAt: string;
  jiraUsers?: JiraUser[];
}

// ── Utilisateurs JIRA (comptes importés) ──

export interface JiraUser {
  id: number;
  jiraAccountId: string;
  jiraConnectionId: number;
  displayName: string;
  emailAddress: string | null;
  isActive: boolean;
  collaboratorId: number | null;
  collaborator?: { id: number; firstName: string; lastName: string; email: string } | null;
  jiraConnection?: { id: number; name: string };
}

export interface JiraUserCandidate {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  active: boolean;
  alreadyImported: boolean;
  associatedProjects: string[];
  jiraGroups: string[];
}

export interface JiraUserCandidatesResponse {
  hasProjects: boolean;
  message: string | null;
  candidates: JiraUserCandidate[];
  availableProjects: string[];
  availableGroups: string[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface JiraUsersSyncResult {
  selectedCount: number;
  upsertedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  syncedCount: number;
}

// ── KPI par collaborateur ──

export interface CollaborateurKpi {
  collaboratorId: number | null;
  jiraAccountId: string;
  displayName: string;
  status: string | null;
  issuesDone: number;
  heuresEstimees: number;
  heuresPassees: number;
  storyPoints: number;
  ratioEstimeConsomme: number | null;
}

export interface KpiByUserRow {
  collaboratorId: number;
  displayName: string;
  status: string;
  kpis: Array<{
    kpiName: string;
    unit: string | null;
    value: number | null;
    ticketCount: number;
    excludedTicketCount: number;
    thresholdRedMin: number | null;
    thresholdRedMax: number | null;
    thresholdOrangeMin: number | null;
    thresholdOrangeMax: number | null;
    thresholdGreenMin: number | null;
    thresholdGreenMax: number | null;
  }>;
}

// ── KPI personnels (my-kpis) ──

export interface MyKpiClient {
  clientId: number;
  clientName: string;
  kpis: Array<{
    kpiName: string;
    unit: string | null;
    value: number | null;
    ticketCount: number;
    thresholdRedMin: number | null;
    thresholdRedMax: number | null;
    thresholdOrangeMin: number | null;
    thresholdOrangeMax: number | null;
    thresholdGreenMin: number | null;
    thresholdGreenMax: number | null;
  }>;
}

export interface KpiSourceIssue {
  id: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assigneeJiraAccountId: string | null;
  assigneeDisplayName: string | null;
  originalEstimateHours: number | null;
  timeSpentSeconds: number | null;
  rollupEstimateHours: number | null;
  rollupTimeSpentHours: number | null;
  rollupRemainingHours: number | null;
}

export interface KpiCalcSchedule {
  id: number;
  clientId: number | null;
  kpiDefinitionId: number | null;
  cronExpression: string;
  periodMode: string;
  allClients: boolean;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  client?: { id: number; name: string } | null;
  kpiDefinition?: { id: number; name: string } | null;
}

export interface IssueWorklogDetail {
  id: number;
  issueKey: string;
  issueSummary: string | null;
  isSubtask: boolean;
  authorDisplayName: string;
  timeSpentSeconds: number;
  startedAt: string;
  source: 'JIRA' | 'TEMPO';
}

// ── Issues & Worklogs ──

export interface IssueRow {
  id: number;
  clientId: number;
  projectId: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assigneeJiraAccountId: string | null;
  assigneeDisplayName: string | null;
  originalEstimateHours: number | null;
  timeSpentSeconds: number | null;
  rollupEstimateHours: number | null;
  rollupTimeSpentSeconds: number | null;
  rollupTimeSpentHours: number | null;
  storyPoints: number | null;
  jiraCreatedAt: string;
  jiraUpdatedAt: string;
  resolvedAt: string | null;
  project: {
    jiraProjectKey: string;
    jiraProjectName: string;
    client: { id: number; name: string };
  };
}

export interface WorklogRow {
  id: number;
  authorJiraAccountId: string;
  authorDisplayName: string;
  timeSpentSeconds: number;
  startedAt: string;
  source: 'JIRA' | 'TEMPO';
  jiraWorklogId: string | null;
  tempoWorklogId: string | null;
  issue: {
    jiraKey: string;
    summary: string;
    project: {
      jiraProjectName: string;
      client: { id: number; name: string };
    };
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TransitionRow {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  jiraKey: string;
  summary: string;
  issueType: string;
  projectName: string;
  clientName: string;
  assigneeDisplayName: string | null;
}

// ── Moteur de formules ──

export interface MetricInfo {
  id: string;
  label: string;
  description: string;
  source: 'issues' | 'worklogs';
  valueType: 'number' | 'duration' | 'count' | 'percentage';
}

export type FormulaFunction = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'ratio' | 'round' | 'subtract' | 'add' | 'multiply' | 'divide' | 'if_gt';

export interface FormulaNode {
  type: 'function' | 'metric' | 'constant';
  name?: FormulaFunction;
  id?: string;
  value?: number;
  args?: FormulaNode[];
  filters?: FormulaFilters;
}

export interface CustomFieldFilter {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_null' | 'not_null' | 'gte' | 'lte' | 'between';
  value?: string | string[];
}

export type ScopeRule =
  | { type: 'resolved_in_period' }
  | { type: 'updated_in_period' }
  | { type: 'worklogs_in_period' }
  | { type: 'worklogs_in_period_with_children' }
  | { type: 'status_in_period'; statuses: string[]; slidingWindowMonths?: number }
  | { type: 'sprint_in_period' }
  | { type: 'created_in_period' }
  | { type: 'combined'; rules: ScopeRule[]; logic: 'AND' | 'OR' }
  ;

export interface FormulaFilters {
  scopeRule?: ScopeRule;
  issueTypes?: string[];
  statuses?: string[];
  labels?: string[];
  components?: string[];
  excludeJiraKeys?: string[];
  includeSubtasks?: boolean;
  customFieldFilters?: CustomFieldFilter[];
  customFieldLogic?: 'AND' | 'OR';
}

export interface FormulaAst {
  version: 1;
  expression: FormulaNode;
  filters: FormulaFilters;
  description?: string;
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
  description?: string;
}

export interface FormulaTestResult {
  valid: boolean;
  errors?: string[];
  description?: string;
  result?: {
    value: number | null;
    ticketCount: number;
    excludedTicketCount: number;
    debug?: Record<string, number | null>;
  };
}

// ── Job Logs ──

export interface JobLog {
  id: number;
  jobType: 'IMPORT' | 'KPI_CALC';
  clientId: number | null;
  kpiDefinitionId: number | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  triggeredBy: 'MANUAL' | 'SCHEDULER';
  periodMode: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  itemsProcessed: number;
  errorCount: number;
  errorMessage: string | null;
  metadata?: { issuesFetched?: number; worklogsFetched?: number; details?: unknown[] | string[] } | null;
  client?: { id: number; name: string } | null;
  kpiDefinition?: { id: number; name: string } | null;
}

// --- UI helpers ---

function inRange(value: number, min: number | null, max: number | null): boolean {
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

export function getRagStatus(
  value: number | null,
  thresholds: {
    thresholdRedMin?: number | null;
    thresholdRedMax?: number | null;
    thresholdOrangeMin?: number | null;
    thresholdOrangeMax?: number | null;
    thresholdGreenMin?: number | null;
    thresholdGreenMax?: number | null;
  },
): RagStatus {
  if (value === null) return 'NEUTRAL';
  const t = thresholds;
  const hasRed = t.thresholdRedMin != null || t.thresholdRedMax != null;
  const hasOrange = t.thresholdOrangeMin != null || t.thresholdOrangeMax != null;
  const hasGreen = t.thresholdGreenMin != null || t.thresholdGreenMax != null;
  if (hasRed && inRange(value, t.thresholdRedMin ?? null, t.thresholdRedMax ?? null)) return 'RED';
  if (hasOrange && inRange(value, t.thresholdOrangeMin ?? null, t.thresholdOrangeMax ?? null)) return 'ORANGE';
  if (hasGreen && inRange(value, t.thresholdGreenMin ?? null, t.thresholdGreenMax ?? null)) return 'GREEN';
  return 'NEUTRAL';
}
