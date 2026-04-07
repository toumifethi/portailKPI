/**
 * Catalogue des métriques de base disponibles pour construire des formules KPI.
 * Chaque métrique est une "brique" exposée dans l'éditeur guidé.
 */

export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  source: 'issues' | 'worklogs';
  /** Champ Prisma à agréger (null = comptage) */
  field: string | null;
  /** Transformation à appliquer après lecture */
  transform?: 'secondsToHours';
  /** Filtre implicite toujours appliqué */
  implicitFilter?: Record<string, unknown>;
  /** Type de valeur retournée */
  valueType: 'number' | 'duration' | 'count' | 'percentage';
}

export const METRICS_CATALOG: MetricDefinition[] = [
  // ── Temps (issues) ──
  {
    id: 'consomme',
    label: 'Temps consommé (h)',
    description: 'Somme du temps passé sur les issues (timeSpentSeconds converti en heures)',
    source: 'issues',
    field: 'timeSpentSeconds',
    transform: 'secondsToHours',
    valueType: 'duration',
  },
  {
    id: 'estime',
    label: 'Temps estimé (h)',
    description: 'Somme des estimations initiales des issues (originalEstimateHours)',
    source: 'issues',
    field: 'originalEstimateHours',
    valueType: 'duration',
  },
  {
    id: 'rollup_consomme',
    label: 'Consommé rollup (h)',
    description: 'Temps consommé cumulé incluant sous-tâches (rollupTimeSpentHours)',
    source: 'issues',
    field: 'rollupTimeSpentHours',
    valueType: 'duration',
  },
  {
    id: 'rollup_estime',
    label: 'Estimé rollup (h)',
    description: 'Temps estimé cumulé incluant sous-tâches (rollupEstimateHours)',
    source: 'issues',
    field: 'rollupEstimateHours',
    valueType: 'duration',
  },

  {
    id: 'temps_restant',
    label: 'Temps restant (h)',
    description: 'Remaining estimate JIRA (remainingEstimateSeconds converti en heures)',
    source: 'issues',
    field: 'remainingEstimateSeconds',
    transform: 'secondsToHours',
    valueType: 'duration',
  },
  {
    id: 'rollup_restant',
    label: 'Restant rollup (h)',
    description: 'Remaining estimate cumulé incluant sous-tâches (rollupRemainingHours)',
    source: 'issues',
    field: 'rollupRemainingHours',
    valueType: 'duration',
  },

  // ── Compteurs (issues) ──
  {
    id: 'nb_issues',
    label: "Nombre d'issues",
    description: 'Compte le nombre total d\'issues correspondant aux filtres',
    source: 'issues',
    field: null,
    valueType: 'count',
  },
  {
    id: 'nb_bugs',
    label: 'Nombre de bugs',
    description: 'Compte les issues de type Bug',
    source: 'issues',
    field: null,
    implicitFilter: { issueType: 'Bug' },
    valueType: 'count',
  },
  {
    id: 'nb_stories',
    label: 'Nombre de stories',
    description: 'Compte les issues de type Story',
    source: 'issues',
    field: null,
    implicitFilter: { issueType: 'Story' },
    valueType: 'count',
  },
  {
    id: 'nb_sans_estimation',
    label: 'Issues sans estimation',
    description: 'Compte les issues dont originalEstimateHours est null ou 0',
    source: 'issues',
    field: null,
    implicitFilter: { _noEstimate: true },
    valueType: 'count',
  },

  // ── Story points ──
  {
    id: 'story_points',
    label: 'Story points',
    description: 'Somme des story points des issues',
    source: 'issues',
    field: 'storyPoints',
    valueType: 'number',
  },

  // ── Worklogs ──
  {
    id: 'temps_logue',
    label: 'Temps logué worklogs (h)',
    description: 'Somme du temps de tous les worklogs (tous auteurs confondus)',
    source: 'worklogs',
    field: 'timeSpentSeconds',
    transform: 'secondsToHours',
    valueType: 'duration',
  },
  {
    id: 'temps_logue_auteur',
    label: 'Temps logué par le collaborateur (h)',
    description: 'Somme du temps des worklogs uniquement pour le collaborateur évalué. Fiable pour les KPI individuels car exclut les worklogs des autres personnes.',
    source: 'worklogs',
    field: 'timeSpentSeconds',
    transform: 'secondsToHours',
    implicitFilter: { _filterByAuthor: true },
    valueType: 'duration',
  },
  {
    id: 'nb_worklogs',
    label: 'Nombre de worklogs',
    description: 'Compte le nombre de worklogs',
    source: 'worklogs',
    field: null,
    valueType: 'count',
  },

  // ── Qualité (liens issues) ──
  {
    id: 'nb_retours',
    label: 'Nombre de retours',
    description: 'Compte les issues qui sont des retours (liées via issue link de type retour)',
    source: 'issues',
    field: null,
    implicitFilter: { _hasReturnLink: true },
    valueType: 'count',
  },
  {
    id: 'nb_tickets_dev',
    label: 'Nombre de tickets dev',
    description: 'Compte les issues de développement (hors retours)',
    source: 'issues',
    field: null,
    implicitFilter: { _isDevTicket: true },
    valueType: 'count',
  },
  {
    id: 'nb_tickets_sans_retour',
    label: 'Tickets sans retour',
    description: 'Compte les issues de développement qui n\'ont aucun retour lié',
    source: 'issues',
    field: null,
    implicitFilter: { _noReturnLink: true },
    valueType: 'count',
  },
  {
    id: 'consomme_retours',
    label: 'Temps consommé retours (h)',
    description: 'Temps passé sur les issues de retour uniquement',
    source: 'issues',
    field: 'rollupTimeSpentHours',
    implicitFilter: { _hasReturnLink: true },
    valueType: 'duration',
  },
];

/** Retrouve une métrique par son ID */
export function getMetric(id: string): MetricDefinition | undefined {
  return METRICS_CATALOG.find((m) => m.id === id);
}
