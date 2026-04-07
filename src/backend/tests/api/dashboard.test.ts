import request from 'supertest';
import { createApp } from '@/api/app';
import { prisma } from '@/db/prisma';

// Mock auth middleware pour les tests API
jest.mock('@/auth/jwtMiddleware', () => ({
  requireAuth: (req: Express.Request, _res: Express.Response, next: () => void) => {
    (req as unknown as { user: unknown }).user = {
      id: 1,
      email: 'admin@test.com',
      roles: ['ADMIN'],
      azureOid: 'test-oid',
    };
    next();
  },
}));

jest.mock('@/db/prisma', () => ({
  prisma: {
    kpiResult: { findMany: jest.fn() },
    userClient: { findFirst: jest.fn() },
    kpiClientConfig: { findMany: jest.fn() },
    client: { findMany: jest.fn() },
  },
}));

const mockKpiResultFindMany = prisma.kpiResult.findMany as jest.Mock;
const mockUserClientFindFirst = prisma.userClient.findFirst as jest.Mock;

const app = createApp();

describe('GET /api/dashboard/kpis', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne 400 si clientId manquant', async () => {
    const res = await request(app)
      .get('/api/dashboard/kpis')
      .query({ period: '2025-11' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_PARAMS');
  });

  it('retourne 400 si period manquant', async () => {
    const res = await request(app)
      .get('/api/dashboard/kpis')
      .query({ clientId: 1 });

    expect(res.status).toBe(400);
  });

  it('retourne les KPI pour un admin sans vérifier l\'accès client', async () => {
    mockKpiResultFindMany.mockResolvedValue([
      {
        id: 1,
        value: 85.5,
        ticketCount: 20,
        excludedTicketCount: 2,
        computedAt: new Date('2025-11-30'),
        formulaVersion: '1.0',
        kpiClientConfig: {
          alertThresholdRed: 70,
          alertThresholdOrange: 80,
          kpiDefinition: { id: 10, name: 'Ratio Retours', unit: '%' },
        },
      },
    ]);

    const res = await request(app)
      .get('/api/dashboard/kpis')
      .query({ clientId: 1, period: '2025-11' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kpiName).toBe('Ratio Retours');
    expect(res.body[0].value).toBe(85.5);
  });
});

describe('GET /api/dashboard/cross-client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne 400 si kpiDefinitionId manquant', async () => {
    const res = await request(app).get('/api/dashboard/cross-client');

    expect(res.status).toBe(400);
  });
});
