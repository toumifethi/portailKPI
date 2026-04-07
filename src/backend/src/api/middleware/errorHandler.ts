import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code ?? 'APP_ERROR', message: err.message },
    });
    return;
  }

  // Erreurs Prisma — not found
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2025'
  ) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }

  logger.error('Unhandled error', {
    path: req.path,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
