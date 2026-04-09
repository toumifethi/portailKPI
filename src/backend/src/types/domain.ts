// ============================================================
// Types domaine — alignés sur le schéma Prisma
// ============================================================

export type Role = 'ADMIN' | 'DELIVERY_MANAGER' | 'CHEF_DE_PROJET' | 'DEVELOPPEUR';

// ---- Config KPI fusionnée (base_config + config_override) ----

export interface FinalKpiConfig {
  // Communs à tous les KPI
  included_issue_types?: string[];
  excluded_issue_types?: string[];
  estimate_field?: string;
  time_spent_field?: string;
  include_subtasks?: boolean;
  aggregation_rule?: 'AVG' | 'SUM';
  period_type?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

  // SQL
  sql?: string;

  // Autres paramètres libres
  [key: string]: unknown;
}

// ---- Contexte de calcul passé à chaque calculator ----

export interface CalculationContext {
  clientId: number;
  projectIds: number[];
  periodStart: Date;
  periodEnd: Date;
  periodType: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  formulaVersion: string;
  // Si défini, le calcul est scopé à ce collaborateur
  collaboratorId?: number;
  jiraAccountIds?: string[];
  /** Type de lien JIRA pour les retours (ex: "Bug attaché", "est un retour de") */
  returnLinkType?: string;
  /** Mode debug : active la capture des requêtes pour le diagnostic */
  debugMode?: boolean;
  /** Collecteur interne pour les traces debug (injecté par le moteur) */
  _queryCollector?: unknown;
}

// ---- Résultat brut d'un calculator ----

export interface KpiCalculationResult {
  value: number | null;
  ticketCount: number;
  excludedTicketCount: number;
  excludedTicketDetails: ExcludedTicket[];
}

export interface ExcludedTicket {
  jiraKey: string;
  reason: ExclusionReason;
}

export type ExclusionReason =
  | 'MISSING_ESTIMATE'
  | 'MISSING_IMPUTATION_USER'
  | 'UNKNOWN_USER'
  | 'ZERO_ESTIMATE'
  | 'EXCLUDED_TYPE'
  | 'EXCLUDED_STATUS';

export const EMPTY_RESULT: KpiCalculationResult = {
  value: null,
  ticketCount: 0,
  excludedTicketCount: 0,
  excludedTicketDetails: [],
};

// ---- Field mapping per JIRA connection ----

export interface JiraFieldMapping {
  storyPoints?: string;   // e.g. "customfield_10016"
  sprints?: string;       // e.g. "customfield_10020"
  returnLinkType?: string; // JIRA link type name for "retours" KPI, e.g. "est un retour de"
}

export const DEFAULT_FIELD_MAPPING: JiraFieldMapping = {
  storyPoints: 'customfield_10016',
  sprints: 'customfield_10020',
  returnLinkType: 'est un retour de',
};

// ---- Job payloads ----

export interface ImportJobPayload {
  importJobId: number;
  clientId: number;
  type: 'INCREMENTAL' | 'BACKFILL' | 'SCHEDULED';
  periodStart: string; // ISO string
  periodEnd: string;   // ISO string
  jql?: string;
}

export interface KpiCalcJobPayload {
  clientId: number;
  importJobId: number;
}
