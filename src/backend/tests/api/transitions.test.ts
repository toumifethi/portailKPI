import express from 'express';
import request from 'supertest';
import { prisma } from '@/db/prisma';
import transitionsRouter from '@/api/routes/transitions';

jest.mock('@/config', () => ({
  config: {
    CORS_ORIGIN: 'http://localhost:5173',
  },
}));

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
    jiraConnection: { findUnique: jest.fn() },
    client: { findMany: jest.fn() },
    issueTransition: { findMany: jest.fn() },
    jiraUser: { findMany: jest.fn() },
  },
}));

const mockJiraConnectionFindUnique = prisma.jiraConnection.findUnique as jest.Mock;
const mockClientFindMany = prisma.client.findMany as jest.Mock;
const mockIssueTransitionFindMany = prisma.issueTransition.findMany as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/transitions', transitionsRouter);

describe('GET /api/transitions/statuses/by-jira-connection/:jiraConnectionId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne 400 si jiraConnectionId est invalide', async () => {
    const res = await request(app).get('/api/transitions/statuses/by-jira-connection/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid jiraConnectionId');
  });

  it('retourne les statuts distincts pour une connexion JIRA', async () => {
    mockJiraConnectionFindUnique.mockResolvedValue({ id: 7 });
    mockIssueTransitionFindMany
      .mockResolvedValueOnce([{ fromStatus: 'In Progress' }, { fromStatus: 'To Do' }])
      .mockResolvedValueOnce([{ toStatus: 'Done' }, { toStatus: 'En recette' }]);

    const res = await request(app).get('/api/transitions/statuses/by-jira-connection/7');

    expect(res.status).toBe(200);
    expect(mockJiraConnectionFindUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true },
    });
    expect(mockClientFindMany).not.toHaveBeenCalled();
    expect(mockIssueTransitionFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        issue: { client: { jiraConnectionId: 7 } },
        fromStatus: { not: null },
      },
      select: { fromStatus: true },
      distinct: ['fromStatus'],
      orderBy: { fromStatus: 'asc' },
    });
    expect(mockIssueTransitionFindMany).toHaveBeenNthCalledWith(2, {
      where: { issue: { client: { jiraConnectionId: 7 } } },
      select: { toStatus: true },
      distinct: ['toStatus'],
      orderBy: { toStatus: 'asc' },
    });
    expect(res.body).toEqual({
      fromStatuses: ['In Progress', 'To Do'],
      toStatuses: ['Done', 'En recette'],
    });
  });
});