import winston from 'winston';
import { config } from '@/config';

export const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.NODE_ENV === 'development'
      ? winston.format.prettyPrint()
      : winston.format.json(),
  ),
  defaultMeta: { service: 'portail-kpi-backend' },
  transports: [new winston.transports.Console()],
});
