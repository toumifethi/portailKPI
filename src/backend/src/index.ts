import { config } from './config';
import { createApp } from './api/app';
import { prisma } from './db/prisma';
import { startKpiEngineWorker } from './engine';
import { startImportWorker } from './importer/importOrchestrator';
import { startScheduler } from './services/scheduler';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  // Valider la connexion DB au démarrage
  await prisma.$connect();
  logger.info('Database connected');

  // Démarrer le worker d'import JIRA
  startImportWorker(1);
  logger.info('Import worker started');

  // Démarrer le worker KPI Engine
  startKpiEngineWorker(config.KPI_RECALC_CONCURRENCY);
  logger.info('KPI engine worker started');

  // Démarrer le scheduler d'imports planifiés
  await startScheduler();

  // Démarrer le serveur HTTP
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    logger.info(`Server listening on port ${port}`, {
      env: process.env.NODE_ENV ?? 'development',
    });
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err });
  process.exit(1);
});
