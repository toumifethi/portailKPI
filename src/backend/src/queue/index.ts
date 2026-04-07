import Bull from 'bull';
import { config } from '@/config';
import { ImportJobPayload, KpiCalcJobPayload } from '@/types/domain';

const redisOpts = { redis: config.REDIS_URL };

// ---- Queues ----

/** Queue unique pour tous les imports (le clientId est dans le payload) */
export const importQueue = new Bull<ImportJobPayload>('import:jobs', {
  ...redisOpts,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 }, // 1min, 5min, 15min
    removeOnComplete: 100,
    removeOnFail: 200,
  },
  settings: {
    stalledInterval: 30_000,
    maxStalledCount: 2,
  },
});

/** @deprecated Utiliser importQueue directement */
export function getImportQueue(_clientId: number): Bull.Queue<ImportJobPayload> {
  return importQueue;
}

/** Queue de calcul KPI — déclenchée après chaque import réussi */
export const kpiCalcQueue = new Bull<KpiCalcJobPayload>('kpi:calculation', {
  ...redisOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10_000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});
