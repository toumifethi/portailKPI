import { PrismaClient } from '@prisma/client';

// Singleton Prisma client — évite les connexions multiples en dev (hot-reload)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const verboseLog = process.env.LOG_VERBOSE === 'true';

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: verboseLog ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
