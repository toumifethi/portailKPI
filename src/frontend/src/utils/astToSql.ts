/**
 * Convertisseur AST → SQL (lecture seule, informatif).
 *
 * Génère une approximation SQL lisible de la formule AST
 * pour aider les utilisateurs à comprendre la logique.
 * NE PAS utiliser pour exécuter directement : c'est un outil de visualisation.
 */

import type { FormulaAst, FormulaNode, FormulaFilters, ScopeRule } from '@/types';

/** Catalogue simplifié des métriques → colonnes SQL */
const METRIC_MAP: Record<string, { table: 'issues' | 'worklogs'; field: string | null; transform?: 'secondsToHours'; implicitWhere?: string }> = {
  consomme:              { table: 'issues', field: 'i.timeSpentSeconds', transform: 'secondsToHours' },
  estime:                { table: 'issues', field: 'i.originalEstimateHours' },
  rollup_consomme:       { table: 'issues', field: 'i.rollupTimeSpentHours' },
  rollup_estime:         { table: 'issues', field: 'i.rollupEstimateHours' },
  temps_restant:         { table: 'issues', field: 'i.remainingEstimateSeconds', transform: 'secondsToHours' },
  rollup_restant:        { table: 'issues', field: 'i.rollupRemainingHours' },
  nb_issues:             { table: 'issues', field: null },
  story_points:          { table: 'issues', field: 'i.storyPoints' },
  temps_logue:           { table: 'worklogs', field: 'w.timeSpentSeconds', transform: 'secondsToHours' },
  nb_worklogs:           { table: 'worklogs', field: null },
};

function fieldExpr(field: string, transform?: 'secondsToHours'): string {
  return transform === 'secondsToHours' ? `(${field} / 3600)` : field;
}

function scopeToWhere(rule: ScopeRule): string[] {
  const clauses: string[] = [];
  switch (rule.type) {
    case 'resolved_in_period':
      clauses.push('i.resolvedAt >= :period_start', 'i.resolvedAt <= :period_end');
      break;
    case 'updated_in_period':
      clauses.push('i.jiraUpdatedAt >= :period_start', 'i.jiraUpdatedAt <= :period_end');
      break;
    case 'created_in_period':
      clauses.push('i.jiraCreatedAt >= :period_start', 'i.jiraCreatedAt <= :period_end');
      break;
    case 'worklogs_in_period':
      clauses.push(
        "(\n    EXISTS (SELECT 1 FROM worklogs w2 WHERE w2.issueId = i.id AND w2.startedAt >= :period_start AND w2.startedAt <= :period_end)\n" +
        "    OR i.jiraId IN (\n      SELECT i2.parentId FROM issues i2\n      JOIN worklogs w3 ON w3.issueId = i2.id\n      WHERE w3.startedAt >= :period_start AND w3.startedAt <= :period_end AND i2.parentId IS NOT NULL\n    )\n  )"
      );
      break;
    case 'status_in_period': {
      const statuses = rule.statuses.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
      const months = rule.slidingWindowMonths ?? 1;
      clauses.push(
        `EXISTS (\n    SELECT 1 FROM issue_transitions t\n    WHERE t.issueId = i.id\n      AND t.toStatus IN (${statuses})\n      AND t.changedAt >= DATE_FORMAT(DATE_SUB(:period_start, INTERVAL ${months - 1} MONTH), '%Y-%m-01')\n      AND t.changedAt <= :period_end\n  )`
      );
      break;
    }
    case 'sprint_in_period':
      clauses.push(
        "EXISTS (\n    SELECT 1 FROM issue_sprints isp\n    JOIN grouping_entities ge ON ge.id = isp.groupingEntityId\n    WHERE isp.issueId = i.id AND ge.entityType = 'SPRINT'\n      AND ge.startDate <= :period_end AND ge.endDate >= :period_start\n  )"
      );
      break;
    case 'linked_to': {
      const baseScopeSql = scopeToWhere(rule.baseScope).join(' AND ');
      const baseTypeFilter = rule.baseFilters?.issueTypes?.length
        ? ` AND base.issueType IN (${rule.baseFilters.issueTypes.map((t) => `'${t}'`).join(', ')})`
        : '';
      const linkCol = rule.direction === 'source' ? 'sourceIssueId' : 'targetIssueId';
      const baseCol = rule.direction === 'source' ? 'targetIssueId' : 'sourceIssueId';
      clauses.push(
        `i.id IN (\n    SELECT il.${linkCol} FROM issue_links il\n    JOIN issues base ON base.id = il.${baseCol}\n    WHERE il.linkType LIKE '%${rule.linkTypeContains.replace(/'/g, "''")}%'\n      AND ${baseScopeSql.replace(/\bi\./g, 'base.')}${baseTypeFilter.replace(/\bi\./g, 'base.')}\n  )`,
      );
      break;
    }
    case 'combined': {
      const logic = rule.logic === 'OR' ? ' OR ' : ' AND ';
      const parts = rule.rules.map((r) => {
        const sub = scopeToWhere(r);
        return sub.length > 1 ? `(${sub.join(' AND ')})` : sub[0] ?? 'TRUE';
      });
      if (parts.length > 0) clauses.push(`(${parts.join(logic)})`);
      break;
    }
  }
  return clauses;
}

function filtersToWhere(filters: FormulaFilters | undefined): string[] {
  if (!filters) return [];
  const clauses: string[] = [];

  // Base context
  clauses.push('i.clientId = :client_id', 'i.projectId IN (:project_ids)');

  // Scope rule
  if (filters.scopeRule) {
    clauses.push(...scopeToWhere(filters.scopeRule));
  }


  // Issue types
  if (filters.issueTypes && filters.issueTypes.length > 0) {
    clauses.push(`i.issueType IN (${filters.issueTypes.map((t) => `'${t}'`).join(', ')})`);
  }

  // Statuses
  if (filters.statuses && filters.statuses.length > 0) {
    clauses.push(`i.status IN (${filters.statuses.map((s) => `'${s}'`).join(', ')})`);
  }

  // Exclude keys
  if (filters.excludeJiraKeys && filters.excludeJiraKeys.length > 0) {
    clauses.push(`i.jiraKey NOT IN (${filters.excludeJiraKeys.map((k) => `'${k}'`).join(', ')})`);
  }

  // Collaborator
  clauses.push('(:collaborator_id IS NULL OR i.assigneeJiraAccountId IN (:jira_account_ids))');

  // Custom field filters (approximation — JSON_EXTRACT)
  if (filters.customFieldFilters && filters.customFieldFilters.length > 0) {
    const logic = filters.customFieldLogic === 'OR' ? ' OR ' : ' AND ';
    const cfClauses = filters.customFieldFilters.map((cf) => {
      const path = `JSON_UNQUOTE(JSON_EXTRACT(i.customFields, '$.${cf.fieldId}'))`;
      switch (cf.operator) {
        case 'equals': return `${path} = '${cf.value}'`;
        case 'not_equals': return `${path} != '${cf.value}'`;
        case 'in': {
          const vals = Array.isArray(cf.value) ? cf.value : [cf.value];
          return `${path} IN (${vals.map((v) => `'${v}'`).join(', ')})`;
        }
        case 'not_in': {
          const vals = Array.isArray(cf.value) ? cf.value : [cf.value];
          return `${path} NOT IN (${vals.map((v) => `'${v}'`).join(', ')})`;
        }
        case 'is_null': return `${path} IS NULL`;
        case 'not_null': return `${path} IS NOT NULL`;
        case 'gte': return `CAST(${path} AS DECIMAL) >= ${cf.value}`;
        case 'lte': return `CAST(${path} AS DECIMAL) <= ${cf.value}`;
        default: return `/* ${cf.operator} non traduit */`;
      }
    });
    clauses.push(`(${cfClauses.join(logic)})`);
  }

  // Issue field filters
  if (filters.issueFieldFilters && filters.issueFieldFilters.length > 0) {
    for (const ff of filters.issueFieldFilters) {
      const col = `i.${ff.field}`;
      switch (ff.operator) {
        case 'is_null': clauses.push(`${col} IS NULL`); break;
        case 'is_not_null': clauses.push(`${col} IS NOT NULL`); break;
        case 'is_zero': clauses.push(`${col} = 0`); break;
        case 'is_null_or_zero': clauses.push(`(${col} IS NULL OR ${col} = 0)`); break;
        case 'gt_zero': clauses.push(`${col} > 0`); break;
        case 'equals': clauses.push(`${col} = ${ff.value ?? 0}`); break;
        case 'gte': clauses.push(`${col} >= ${ff.value ?? 0}`); break;
        case 'lte': clauses.push(`${col} <= ${ff.value ?? 0}`); break;
      }
    }
  }

  return clauses;
}

/** Résout un nœud métrique en expression SQL (SELECT) */
function metricToSql(metricId: string, filters: FormulaFilters | undefined, fnName: string): string {
  const m = METRIC_MAP[metricId];
  if (!m) return `/* metrique inconnue: ${metricId} */`;

  const whereClauses = filtersToWhere(filters);
  if (m.implicitWhere) whereClauses.push(m.implicitWhere);

  const whereStr = whereClauses.length > 0 ? whereClauses.join('\n  AND ') : '1=1';

  if (m.table === 'worklogs') {
    const selectExpr = m.field
      ? (fnName === 'avg' ? `AVG(${fieldExpr(m.field, m.transform)})` : `SUM(${fieldExpr(m.field, m.transform)})`)
      : 'COUNT(*)';
    return `(SELECT ${selectExpr}\n FROM worklogs w\n JOIN issues i ON i.id = w.issueId\n WHERE ${whereStr})`;
  }

  // issues table
  if (m.field === null) {
    // count
    return `(SELECT COUNT(*)\n FROM issues i\n WHERE ${whereStr})`;
  }

  const agg = fnName === 'avg' ? 'AVG' : 'SUM';
  return `(SELECT ${agg}(COALESCE(${fieldExpr(m.field, m.transform)}, 0))\n FROM issues i\n WHERE ${whereStr})`;
}

/** Merge des filtres global + local (même logique que le moteur) */
function mergeFilters(global: FormulaFilters, local?: Partial<FormulaFilters>): FormulaFilters {
  if (!local) return global;
  return {
    ...global,
    ...local,
    issueTypes: local.issueTypes ?? global.issueTypes,
    statuses: local.statuses ?? global.statuses,
  };
}

/** Convertit un nœud AST en expression SQL */
function nodeToSql(node: FormulaNode, globalFilters: FormulaFilters): string {
  switch (node.type) {
    case 'constant':
      return String(node.value ?? 0);

    case 'metric': {
      // Un metric seul → SUM par défaut
      return metricToSql(node.id!, globalFilters, 'sum');
    }

    case 'function': {
      const name = node.name!;
      const args = node.args ?? [];
      const merged = mergeFilters(globalFilters, node.filters);

      // Unary agg: sum, count, avg → passer au metric
      if (['sum', 'count', 'avg'].includes(name) && args.length === 1 && args[0].type === 'metric') {
        return metricToSql(args[0].id!, merged, name);
      }

      // Unary pass-through for non-metric args
      if (['sum', 'count', 'avg'].includes(name) && args.length === 1) {
        return nodeToSql(args[0], merged);
      }

      // Binary ops
      if (args.length === 2) {
        const a = nodeToSql(args[0], merged);
        const b = nodeToSql(args[1], merged);

        switch (name) {
          case 'add': return `(${a} + ${b})`;
          case 'subtract': return `(${a} - ${b})`;
          case 'multiply': return `(${a} * ${b})`;
          case 'divide': return `(${a} / NULLIF(${b}, 0))`;
          case 'ratio': return `ROUND(${a} / NULLIF(${b}, 0) * 100, 4)`;
          case 'round': return `ROUND(${a}, ${b})`;
          case 'if_gt': return `CASE WHEN ${a} > ${b} THEN ${a} ELSE ${b} END`;
        }
      }

      return `/* fonction non traduite: ${name} */`;
    }
  }

  return '/* noeud inconnu */';
}

/**
 * Convertit un AST complet en requête SQL lisible.
 * Retourne une approximation informative — pas une requête exécutable telle quelle.
 */
export function astToSql(ast: FormulaAst): string {
  const globalFilters = ast.filters ?? {};
  const valueExpr = nodeToSql(ast.expression, globalFilters);

  return `-- SQL généré automatiquement depuis la formule AST (lecture seule)\n-- Les placeholders :client_id, :period_start, etc. sont remplacés par le moteur.\n\nSELECT\n  ${valueExpr} AS value`;
}
