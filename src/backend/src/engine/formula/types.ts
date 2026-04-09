/**
 * AST (arbre syntaxique) pour les formules KPI guidées.
 * Stocké en JSON dans kpi_definitions.formulaAst.
 *
 * Chaque noeud est soit :
 * - un appel de fonction (sum, avg, count, min, max, ratio, round, if)
 * - une référence à une métrique du catalogue
 * - une constante numérique
 */

// ── Noeuds de l'AST ──

export type FormulaNode = FunctionNode | MetricNode | ConstantNode;

export interface FunctionNode {
  type: 'function';
  name: FormulaFunction;
  args: FormulaNode[];
  /** Optional local filters that override global filters for this branch */
  filters?: Partial<FormulaFilters>;
}

export interface MetricNode {
  type: 'metric';
  /** ID de la métrique dans le catalogue (ex: 'consomme', 'estime') */
  id: string;
}

export interface ConstantNode {
  type: 'constant';
  value: number;
}

// ── Fonctions autorisées ──

export type FormulaFunction =
  | 'sum'    // somme d'une métrique sur les tickets filtrés
  | 'avg'    // moyenne
  | 'count'  // comptage
  | 'min'    // minimum
  | 'max'    // maximum
  | 'ratio'  // ratio(a, b) = (a / b) × 100
  | 'round'  // round(value, decimals)
  | 'subtract' // a - b
  | 'add'    // a + b
  | 'multiply' // a × b
  | 'divide' // a / b
  | 'if_gt'  // if_gt(value, threshold, then, else)
  ;

// ── Filtres appliqués à l'évaluation ──

export interface CustomFieldFilter {
  /** ID du champ custom JIRA (ex: customfield_10050) */
  fieldId: string;
  /** Opérateur de comparaison */
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'is_null' | 'not_null' | 'gte' | 'lte' | 'between';
  /** Valeur(s) — ignoré pour is_null / not_null */
  value?: string | string[];
}

// ── Règle de sélection des issues pour la période ──

export type ScopeRule =
  | { type: 'resolved_in_period' }
  | { type: 'updated_in_period' }
  | { type: 'worklogs_in_period' }
  | { type: 'status_in_period'; statuses: string[]; slidingWindowMonths?: number }
  | { type: 'sprint_in_period' }
  | { type: 'created_in_period' }
  | { type: 'combined'; rules: ScopeRule[]; logic: 'AND' | 'OR' }
  ;

export interface FormulaFilters {
  /** Règle de sélection des issues pour la période */
  scopeRule?: ScopeRule;
  /** Types d'issues à inclure (vide = tous) */
  issueTypes?: string[];
  /** Statuts à inclure (vide = tous) */
  statuses?: string[];
  /** Labels JIRA à inclure (vide = tous) */
  labels?: string[];
  /** Composants JIRA à inclure (vide = tous) */
  components?: string[];
  /** Clés JIRA à exclure (ex: ["ISR-1234", "ISR-5678"]) */
  excludeJiraKeys?: string[];
  /** Filtres sur champs custom JIRA */
  customFieldFilters?: CustomFieldFilter[];
  /** Logique entre les filtres custom : AND (tous) ou OR (au moins un) */
  customFieldLogic?: 'AND' | 'OR';
}

// ── Formule complète (stockée en JSON) ──

export interface FormulaAst {
  /** Version du format AST */
  version: 1;
  /** Arbre de la formule */
  expression: FormulaNode;
  /** Filtres globaux */
  filters: FormulaFilters;
  /** Description humaine auto-générée */
  description?: string;
}

// ── Résultat d'évaluation ──

export interface FormulaEvalResult {
  value: number | null;
  ticketCount: number;
  excludedTicketCount: number;
  /** Détail des métriques intermédiaires (pour le dry-run) */
  debug?: Record<string, number | null>;
}

// ── Validation ──

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
  /** Description humaine générée depuis l'AST */
  description?: string;
}
