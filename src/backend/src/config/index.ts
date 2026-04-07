import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Auth mode — 'dev' bypasse la validation JWT Azure AD
  AUTH_MODE: z.enum(['production', 'dev']).default('production'),

  // Dev profile — utilisés uniquement quand AUTH_MODE=dev
  // DEV_USER_EMAIL : email de l'utilisateur à simuler (cherché en DB)
  // DEV_PROFILE    : rôle de secours si l'email n'existe pas encore en base
  DEV_USER_EMAIL: z.string().optional(),
  DEV_PROFILE: z.enum(['ADMIN', 'DM', 'MANAGER', 'VIEWER']).default('ADMIN'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis / Bull
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Azure AD (optionnels en mode dev)
  AZURE_AD_TENANT_ID: z.string().default('dev-tenant-id'),
  AZURE_AD_CLIENT_ID: z.string().default('dev-client-id'),
  AZURE_AD_AUDIENCE: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('eu-west-1'),

  // KPI Engine
  SQL_KPI_TIMEOUT_MS: z.coerce.number().default(30_000),
  KPI_RECALC_CONCURRENCY: z.coerce.number().default(2),

  // Import
  JIRA_PAGE_SIZE: z.coerce.number().default(100),
  IMPORT_RETRY_ATTEMPTS: z.coerce.number().default(3),

  // Frontend CORS origin
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseEnv();
export type Config = typeof config;
