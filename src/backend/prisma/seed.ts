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

  // ── Définition KPI : Taux de dépassement (formule guidée) ────────────────
  // Formule : (consommé_rollup + restant_rollup - estimé_rollup) / estimé_rollup × 100
  // Inclut le remaining estimate pour projeter le dépassement sur les tickets en cours
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
                { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_consomme' }] },
                { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_restant' }] },
              ],
            },
            { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }] },
          ],
        },
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }] },
      ],
    },
    filters: {
      scopeRule: { type: 'worklogs_in_period_with_children' },
      includeSubtasks: false,
    },
  };

  let kpiDef = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de dépassement' } });
  if (!kpiDef) {
    kpiDef = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de dépassement',
        description: 'Ecart entre le temps consommé et le temps estimé, incluant les sous-tâches. Formule : (consommé - estimé) / estimé × 100',
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: tauxDepassementAst,
        defaultThresholdGreenMax: 10,
        defaultThresholdOrangeMin: 10,
        defaultThresholdOrangeMax: 30,
        defaultThresholdRedMin: 30,
        isSystem: true,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiDef.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiDef.id,
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

  // ── Définition KPI : Taux de dépassement v2 (tickets livrés, fenêtre glissante) ──
  // Formule : (consommé_rollup + restant_rollup - estimé_rollup) / estimé_rollup × 100
  // Portée : tickets ayant transitionné vers statuts cibles sur une fenêtre glissante
  const tauxDepassementV2Ast = {
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
                { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_consomme' }] },
                { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_restant' }] },
              ],
            },
            { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }] },
          ],
        },
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_estime' }] },
      ],
    },
    filters: {
      scopeRule: {
        type: 'status_in_period',
        statuses: ['LIVRE EN PRODUCTION', 'LIVRE EN PREPRODUCTION', 'Realisation terminee'],
        slidingWindowMonths: 3,
      },
      includeSubtasks: false,
    },
  };

  let kpiDefV2 = await prisma.kpiDefinition.findFirst({ where: { name: 'Taux de dépassement v2 - Tickets livrés' } });
  if (!kpiDefV2) {
    kpiDefV2 = await prisma.kpiDefinition.create({
      data: {
        name: 'Taux de dépassement v2 - Tickets livrés',
        description: 'Écart (%) basé sur rollups pour tickets livrés sur fenêtre glissante: (consommé + restant - estimé) / estimé × 100',
        unit: '%',
        formulaType: 'FORMULA_AST',
        baseConfig: {},
        formulaAst: tauxDepassementV2Ast,
        defaultThresholdGreenMax: 10,
        defaultThresholdOrangeMin: 10,
        defaultThresholdOrangeMax: 30,
        defaultThresholdRedMin: 30,
        isSystem: true,
      } as any,
    });
  }

  await prisma.kpiClientConfig.upsert({
    where: { kpiDefinitionId_clientId: { kpiDefinitionId: kpiDefV2.id, clientId: client.id } },
    create: {
      kpiDefinitionId: kpiDefV2.id,
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
  console.log('  ✓ KPI definition: Taux de dépassement v2 - Tickets livrés');

  // ── KPI : Taux de retouche ──────────────────────────────────────────────
  // Formule : temps consommé sur les retours / temps consommé total × 100
  const tauxRetoucheAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'consomme_retours' }] },
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'rollup_consomme' }] },
      ],
    },
    filters: {
      scopeRule: { type: 'worklogs_in_period_with_children' },
      includeSubtasks: false,
    },
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

  // ── KPI : First Time Right ──────────────────────────────────────────────
  // Formule : tickets dev sans retour / tickets dev total × 100
  const firstTimeRightAst = {
    version: 1,
    expression: {
      type: 'function',
      name: 'ratio',
      args: [
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'nb_tickets_sans_retour' }] },
        { type: 'function', name: 'sum', args: [{ type: 'metric', id: 'nb_tickets_dev' }] },
      ],
    },
    filters: {
      scopeRule: { type: 'resolved_in_period' },
      includeSubtasks: false,
    },
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
