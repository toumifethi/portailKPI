import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '@/config';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import kpiRouter from './routes/kpi';
import importsRouter from './routes/imports';
import clientsRouter from './routes/clients';
import jiraConnectionsRouter from './routes/jiraConnections';
import collaboratorsRouter from './routes/collaborators';
import jiraUsersRouter from './routes/jiraUsers';
import issuesRouter from './routes/issues';
import worklogsRouter from './routes/worklogs';
import importSchedulesRouter from './routes/importSchedules';
import profilesRouter from './routes/profiles';
import kpiCalcSchedulesRouter from './routes/kpiCalcSchedules';
import jobLogsRouter from './routes/jobLogs';
import maintenanceRouter from './routes/maintenance';
import issueLinksRouter from './routes/issueLinks';
import transitionsRouter from './routes/transitions';
import appSettingsRouter from './routes/appSettings';

export function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));

  // Health check — pas d'auth requise
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes API
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/kpi', kpiRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/jira-connections', jiraConnectionsRouter);
  app.use('/api/collaborators', collaboratorsRouter);
  app.use('/api/jira-users', jiraUsersRouter);
  app.use('/api/issues', issuesRouter);
  app.use('/api/worklogs', worklogsRouter);
  app.use('/api/import-schedules', importSchedulesRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/kpi-calc-schedules', kpiCalcSchedulesRouter);
  app.use('/api/job-logs', jobLogsRouter);
  app.use('/api/maintenance', maintenanceRouter);
  app.use('/api/issue-links', issueLinksRouter);
  app.use('/api/transitions', transitionsRouter);
  app.use('/api/settings', appSettingsRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Error handler — doit être en dernier
  app.use(errorHandler);

  return app;
}
