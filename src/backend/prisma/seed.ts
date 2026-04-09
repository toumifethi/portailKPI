/**
 * Seed de développement — données initiales pour tester l'application en local.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding dev data...');

  // ── Profils ──────────────────────────────────────────────────────────────────
  const defaultProfiles = [
    { code: 'ADMIN',             label: 'Administrateur',    description: 'Accès total à toutes les fonctionnalités', level: 100 },
    { code: 'DELIVERY_MANAGER',  label: 'Delivery Manager',  description: 'Gestion des clients et suivi des KPIs',    level: 80 },
    { code: 'CHEF_DE_PROJET',    label: 'Chef de projet',    description: 'Gestion des projets et suivi opérationnel', level: 60 },
    { code: 'DEVELOPPEUR',       label: 'Développeur',       description: 'Consultation des KPIs et des données',      level: 40 },
    { code: 'VIEWER',            label: 'Lecteur',           description: 'Consultation en lecture seule',             level: 20 },
  ];

  const profileMap = new Map<string, number>();
  for (const p of defaultProfiles) {
    const profile = await prisma.profile.upsert({
      where: { code: p.code },
      create: p,
      update: { label: p.label, description: p.description, level: p.level },
    });
    profileMap.set(p.code, profile.id);
  }
  console.log('  ✓ Profiles');

  // ── Collaborateurs de dev (un par profil) ──────────────────────────────────
  const devCollaborators = [
    { email: 'admin@dev.local',   firstName: 'Dev', lastName: 'Admin',       profileCode: 'ADMIN' },
    { email: 'dm@dev.local',      firstName: 'Dev', lastName: 'DM',          profileCode: 'DELIVERY_MANAGER' },
    { email: 'manager@dev.local', firstName: 'Dev', lastName: 'Manager',     profileCode: 'CHEF_DE_PROJET' },
    { email: 'dev@dev.local',     firstName: 'Dev', lastName: 'Developpeur', profileCode: 'DEVELOPPEUR' },
    { email: 'viewer@dev.local',  firstName: 'Dev', lastName: 'Lecteur',     profileCode: 'VIEWER' },
  ];

  for (const c of devCollaborators) {
    const profileId = profileMap.get(c.profileCode)!;
    const created = await prisma.collaborator.upsert({
      where: { email: c.email },
      create: {
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        profileId,
        status: 'ACTIF',
      },
      update: { profileId },
    });
    console.log(`  ✓ Collaborator [${c.profileCode}] ${created.email} (id=${created.id})`);
  }

  // ── Connexion JIRA de démo ─────────────────────────────────────────────────
  const JIRA_URL        = process.env.SEED_JIRA_URL        ?? 'https://your-instance.atlassian.net';
  const JIRA_EMAIL      = process.env.SEED_JIRA_EMAIL      ?? 'jira-bot@yourcompany.com';
  const JIRA_API_TOKEN  = process.env.SEED_JIRA_API_TOKEN  ?? 'replace-with-real-token-in-docker-compose';
  const TEMPO_API_TOKEN = process.env.SEED_TEMPO_API_TOKEN ?? 'pUp1aA7TZwlmNGqP800HXQ5ynvQNSs-us';
  const JIRA_PROJECT    = process.env.SEED_JIRA_PROJECT    ?? 'MYPROJECT';

  let jiraConn = await prisma.jiraConnection.findFirst({ where: { name: 'DECADE Jira Demo' } });
  if (!jiraConn) {
    jiraConn = await prisma.jiraConnection.create({
      data: {
        name: 'DECADE Jira Demo',
        jiraUrl: JIRA_URL,
        jiraEmail: JIRA_EMAIL,
        jiraApiToken: JIRA_API_TOKEN,
        tempoApiToken: TEMPO_API_TOKEN,
      },
    });
  } else {
    jiraConn = await prisma.jiraConnection.update({
      where: { id: jiraConn.id },
      data: { jiraUrl: JIRA_URL, jiraEmail: JIRA_EMAIL, jiraApiToken: JIRA_API_TOKEN, tempoApiToken: TEMPO_API_TOKEN },
    });
  }
  console.log(`  ✓ JiraConnection: ${jiraConn.name} (id=${jiraConn.id})`);

  // Mettre a jour le token Tempo sur toutes les connexions JIRA qui n'en ont pas
  if (TEMPO_API_TOKEN) {
    const updated = await prisma.jiraConnection.updateMany({
      where: { tempoApiToken: null },
      data: { tempoApiToken: TEMPO_API_TOKEN },
    });
    if (updated.count > 0) {
      console.log(`  ✓ Tempo token set on ${updated.count} connection(s) without token`);
    }
  }

  // ── Client de démo ────────────────────────────────────────────────────────
  let client = await prisma.client.findFirst({ where: { name: 'Client Démo' } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: 'Client Démo',
        jiraConnectionId: jiraConn.id,
        status: 'ACTIVE',
        groupingType: 'EPIC',
      },
    });
  }
  console.log(`  ✓ Client: ${client.name} (id=${client.id})`);

  // ── Projet de démo ────────────────────────────────────────────────────────
  let project = await prisma.project.findUnique({
    where: { clientId_jiraProjectKey: { clientId: client.id, jiraProjectKey: JIRA_PROJECT } },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        clientId: client.id,
        jiraProjectKey: JIRA_PROJECT,
        jiraProjectName: 'Projet Démo',
        jiraProjectType: 'CLASSIC',
        status: 'ACTIVE',
      },
    });
  }
  console.log(`  ✓ Project: ${project.jiraProjectName}`);

  // ── KPI 1 : Taux de retouche (AST) ──────────────────────────────────────
  // Formule : temps consommé sur les retours / temps consommé total × 100
  const tauxRetoucheAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        {
          type: 'function', name: 'sum', args: [{ type: 'metric', id: 'consomme_retours' }],
          filters: {
            scopeRule: { type: 'worklogs_in_period' },

            customFieldLogic: 'AND',
            customFieldFilters: [
              {
                value: ['Support de l\'IA', 'Code généré par l\'IA', 'Conçu et réalisé par l\'IA'],
                fieldId: 'customfield_13378',
                operator: 'in',
              },
            ],
          },
        },
        {
          type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_consomme' }],
          filters: {
            scopeRule: { type: 'worklogs_in_period' },

            customFieldLogic: 'AND',
            customFieldFilters: [
              {
                value: ['Support de l\'IA', 'Code généré par l\'IA', 'Conçu et réalisé par l\'IA'],
                fieldId: 'customfield_13378',
                operator: 'in',
              },
            ],
          },
        },
      ],
    },
    filters: {},
  };

  let kpiRetouche = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de retouche' } });
  if (!kpiRetouche) {
    kpiRetouche = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de retouche',
        description: 'Part du temps passé en corrections de retours par rapport au temps total. Formule : consommé retours / consommé total × 100',
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: tauxRetoucheAst,
        defaultThresholdGreenMax: 15,
        defaultThresholdOrangeMin: 15,
        defaultThresholdOrangeMax: 30,
        defaultThresholdRedMin: 30,
        isSystem: true,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiRetouche.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiRetouche.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
      thresholdGreenMax: 15,
      thresholdOrangeMin: 15,
      thresholdOrangeMax: 30,
      thresholdRedMin: 30,
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Taux de retouche');

  // ── KPI 2 : First Time Right (AST) ─────────────────────────────────────
  // Formule : tickets dev sans retour / tickets dev total × 100
  const firstTimeRightAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        {
          type: 'function', name: 'sum', args: [{ type: 'metric', id: 'nb_tickets_sans_retour' }],
          filters: {
            scopeRule: { type: 'resolved_in_period' },

          },
        },
        {
          type: 'function', name: 'sum', args: [{ type: 'metric', id: 'nb_tickets_dev' }],
          filters: {
            scopeRule: { type: 'resolved_in_period' },

          },
        },
      ],
    },
    filters: {},
  };

  let kpiFtr = await prisma.kpiDefinition.findFirst({ where: { name: 'First Time Right' } });
  if (!kpiFtr) {
    kpiFtr = await prisma.kpiDefinition.create({
      data: {
        name: 'First Time Right',
        description: 'Pourcentage de tickets livrés sans aucun retour. Formule : tickets sans retour / tickets dev × 100. Plus le taux est élevé, meilleure est la qualité.',
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: firstTimeRightAst,
        defaultThresholdGreenMax: 100,
        defaultThresholdOrangeMin: 70,
        defaultThresholdOrangeMax: 85,
        defaultThresholdRedMin: 0,
        isSystem: true,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiFtr.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiFtr.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
      thresholdGreenMax: 100,
      thresholdOrangeMin: 70,
      thresholdOrangeMax: 85,
      thresholdRedMin: 0,
    },
    update: {},
  });
  console.log('  ✓ KPI definition: First Time Right');

  // ── KPI 3 : Taux de dépassement (AST — tickets livrés, fenêtre glissante) ──
  // Formule : (consommé_rollup + restant_rollup - estimé_rollup) / estimé_rollup × 100
  const tauxDepassementAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        {
          type: 'function',
          name: 'subtract',
          args: [
            {
              type: 'function',
              name: 'add',
              args: [
                {
                  type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_consomme' }],
                  filters: {
                    scopeRule: {
                      type: 'status_in_period',
                      statuses: ['LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee'],
                      slidingWindowMonths: 3,
                    },
        
                  },
                },
                {
                  type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_restant' }],
                  filters: {
                    scopeRule: {
                      type: 'status_in_period',
                      statuses: ['LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee'],
                      slidingWindowMonths: 3,
                    },
        
                  },
                },
              ],
            },
            {
              type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }],
              filters: {
                scopeRule: {
                  type: 'status_in_period',
                  statuses: ['LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee'],
                  slidingWindowMonths: 3,
                },
    
              },
            },
          ],
        },
        {
          type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }],
          filters: {
            scopeRule: {
              type: 'status_in_period',
              statuses: ['LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee'],
              slidingWindowMonths: 3,
            },

          },
        },
      ],
    },
    filters: {},
  };

  let kpiDepassement = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de dépassement' } });
  if (!kpiDepassement) {
    kpiDepassement = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de dépassement',
        description: 'Écart (%) basé sur rollups pour tickets livrés sur fenêtre glissante: (consommé + restant - estimé) / estimé × 100',
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: tauxDepassementAst,
        defaultThresholdGreenMax: 10,
        defaultThresholdOrangeMin: 10,
        defaultThresholdOrangeMax: 30,
        defaultThresholdRedMin: 30,
        isSystem: false,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiDepassement.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiDepassement.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
      thresholdGreenMax: 10,
      thresholdOrangeMin: 10,
      thresholdOrangeMax: 30,
      thresholdRedMin: 30,
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Taux de dépassement');

  // ── KPI 4 : Taux de tickets IA (AST) ───────────────────────────────────
  // Formule : count(issues avec champ IA) / count(issues réalisation terminée) × 100
  const tauxTicketsIaAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        {
          type: 'function',
          name: 'count',
          args: [{ type: 'metric', id: 'nb_issues' }],
          filters: {
            scopeRule: {
              type: 'status_in_period',
              statuses: ['Réalisation terminée'],
              slidingWindowMonths: 1,
            },
            customFieldLogic: 'AND',
            customFieldFilters: [
              {
                value: ['Support de l\'IA', 'Code généré par l\'IA', 'Conçu et réalisé par l\'IA'],
                fieldId: 'customfield_13378',
                operator: 'in',
              },
            ],
          },
        },
        {
          type: 'function',
          name: 'count',
          args: [{ type: 'metric', id: 'nb_issues' }],
          filters: {
            scopeRule: {
              type: 'status_in_period',
              statuses: ['Réalisation terminée'],
              slidingWindowMonths: 1,
            },
          },
        },
      ],
    },
    filters: {},
  };

  let kpiTicketsIA = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de tickets IA' } });
  if (!kpiTicketsIA) {
    kpiTicketsIA = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de tickets IA',
        description: null,
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: tauxTicketsIaAst,
        defaultThresholdGreenMax: null,
        defaultThresholdOrangeMin: 20,
        defaultThresholdOrangeMax: 50,
        defaultThresholdRedMin: null,
        isSystem: false,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiTicketsIA.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiTicketsIA.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Taux de tickets IA');

  // ── KPI 5 : Depassement SQL ─────────────────────────────────────────────
  // Version SQL du taux de dépassement avec scope collaborateur
  const depassementSql = `SELECT
  ROUND(
    (SUM(COALESCE(i.rollupTimeSpentHours, 0) + COALESCE(i.rollupRemainingHours, 0))
     - SUM(COALESCE(i.rollupEstimateHours, 0)))
    / NULLIF(SUM(COALESCE(i.rollupEstimateHours, 0)), 0) * 100
  , 4) AS value,
  COUNT(*) AS ticketCount
FROM issues i
WHERE i.clientId = :client_id
  AND i.projectId IN (:project_ids)
  AND i.issueType != 'Sub-task'
  AND EXISTS (
    SELECT 1 FROM issue_transitions t
    WHERE t.issueId = i.id
      AND t.toStatus IN ('LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee')
      AND t.changedAt >= DATE_FORMAT(DATE_SUB(:period_start, INTERVAL 2 MONTH), '%Y-%m-01')
      AND t.changedAt <= :period_end
  )
  AND (:collaborator_id IS NULL OR i.assigneeJiraAccountId IN (:jira_account_ids))`;

  let kpiDepassementSql = await prisma.kpiDefinition.findFirst({ where: { name: 'Depassement SQL' } });
  if (!kpiDepassementSql) {
    kpiDepassementSql = await prisma.kpiDefinition.create({
      data: {
        name: 'Depassement SQL',
        description: 'Taux de dépassement par rapport à l\'estimation initiale — version SQL avec scope collaborateur',
        unit: '%',
        formulaType: 'SQL',
        baseConfig: { sql: depassementSql },
        formulaAst: null,
        isSystem: false,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiDepassementSql.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiDepassementSql.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Depassement SQL');

  // ── KPI 6 : Taux de retouche SQL ────────────────────────────────────────
  // Version SQL du taux de retouche
  const retoucheSql = `SELECT
  ROUND(
    SUM(CASE WHEN il.id IS NOT NULL THEN COALESCE(i.rollupTimeSpentSeconds, 0) ELSE 0 END)
    / NULLIF(SUM(COALESCE(i.rollupTimeSpentSeconds, 0)), 0) * 100
  , 1) AS value,
  COUNT(DISTINCT i.id) AS ticketCount
FROM issues i
JOIN worklogs w ON w.issueId = i.id
  AND w.startedAt BETWEEN :period_start AND :period_end
LEFT JOIN issue_links il ON il.sourceIssueId = i.id
  AND il.linkType = 'Origine du bug (recit ou bug)'
WHERE i.clientId = :client_id
  AND i.parentJiraId IS NULL
  AND (:collaborator_id IS NULL OR i.assigneeJiraAccountId IN (:jira_account_ids))
GROUP BY NULL`;

  let kpiRetoucheSql = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de retouche SQL' } });
  if (!kpiRetoucheSql) {
    kpiRetoucheSql = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de retouche SQL',
        description: 'Ratio temps consommé sur retours vs temps total — version SQL',
        unit: '%',
        formulaType: 'SQL',
        baseConfig: { sql: retoucheSql },
        formulaAst: null,
        isSystem: false,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiRetoucheSql.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiRetoucheSql.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Taux de retouche SQL');

  // ── KPI Qualité via linked_to (exemple) ──────────────────────────────────
  let kpiQualiteLinked = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de retours' } });
  if (!kpiQualiteLinked) {
    kpiQualiteLinked = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de retours',
        description: 'Ratio temps passe sur les retours lies aux tickets livres / estimation des tickets livres. Utilise le scope linked_to.',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: {
          version: 1,
          expression: {
            type: 'function',
            name: 'ratio',
            args: [
              {
                type: 'function',
                name: 'sum',
                args: [{ type: 'metric', id: 'rollup_consomme' }],
                filters: {
                  scopeRule: {
                    type: 'linked_to',
                    baseScope: { type: 'status_in_period', statuses: ['LIVRE EN PRODUCTION', 'Done', 'Closed'], slidingWindowMonths: 1 },
                    baseFilters: { issueTypes: ['Story', 'Task'] },
                    linkTypeContains: 'est un retour de',
                    direction: 'source',
                  },
                },
              },
              {
                type: 'function',
                name: 'sum',
                args: [{ type: 'metric', id: 'rollup_estime' }],
                filters: {
                  scopeRule: { type: 'status_in_period', statuses: ['LIVRE EN PRODUCTION', 'Done', 'Closed'], slidingWindowMonths: 1 },
                  issueTypes: ['Story', 'Task'],
                },
              },
            ],
          },
          filters: {
            scopeRule: { type: 'worklogs_in_period' },
          },
        },
        unit: '%',
      },
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiQualiteLinked.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiQualiteLinked.id,
      clientId: client.id,
      isActive: true,
      formulaVersion: '1.0',
    },
    update: {},
  });
  console.log('  ✓ KPI definition: Taux de retours');

  // ── Paramètres applicatifs (app_settings) ─────────────────────────────────
  const defaultSettings = [
    { key: 'kpi.debug.maxTracesPerConfig', value: '10',   description: 'Nombre max de traces debug conservees par config KPI (FIFO)' },
    { key: 'kpi.debug.purgeOnDisable',     value: 'true', description: 'Purger les traces quand debugMode passe a false' },
    { key: 'kpi.debug.maxCollaboratorsTraced', value: '0', description: '0 = tous les collaborateurs traces, sinon limite le nombre' },
    {
      key: 'kpi.formula.statusInPeriod.globalFallbackStatuses',
      value: 'Done, Closed, Resolved, Realisation terminee',
      description: 'Statuts cibles proposes en definition KPI globale quand aucune connexion JIRA de reference n\'est selectionnee',
    },
    {
      key: 'kpi.metrics.hidden',
      value: '',
      description: 'IDs de metriques a masquer dans l\'editeur de formules (separes par virgule). Ex: temps_restant, nb_worklogs',
    },
  ];

  for (const s of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: s,
      update: {},
    });
  }
  console.log('  ✓ App settings (kpi.debug.*)');

  console.log('\n✅ Seed complete!');
  console.log('   → Frontend: http://localhost:5173');
  console.log('   → Backend:  http://localhost:3000/health');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
