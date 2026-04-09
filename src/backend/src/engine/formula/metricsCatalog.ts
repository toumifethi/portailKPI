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
    id: 'nb_worklogs',
    label: 'Nombre de worklogs',
    description: 'Compte le nombre de worklogs',
    source: 'worklogs',
    field: null,
    valueType: 'count',
  },

];

/** Retrouve une métrique par son ID */
export function getMetric(id: string): MetricDefinition | undefined {
  return METRICS_CATALOG.find((m) => m.id === id);
}
