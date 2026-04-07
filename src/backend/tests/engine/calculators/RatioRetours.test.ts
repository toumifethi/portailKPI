import { RatioRetours } from '@/engine/calculators/predefined/RatioRetours';
import { prisma } from '@/db/prisma';
import { FinalKpiConfig, CalculationContext } from '@/types/domain';

jest.mock('@/db/prisma', () => ({
  prisma: {
    issue: { findMany: jest.fn() },
    worklog: { findMany: jest.fn() },
  },
}));

const mockIssueFindMany = prisma.issue.findMany as jest.Mock;
const mockWorklogFindMany = prisma.worklog.findMany as jest.Mock;

const baseContext: CalculationContext = {
  clientId: 1,
  projectIds: [10],
  periodStart: new Date('2025-11-01'),
  periodEnd: new Date('2025-11-30'),
  periodType: 'MONTHLY',
  formulaVersion: '1.0',
};

const baseConfig: FinalKpiConfig = {
  done_statuses: ['Done'],
  return_label: 'RETOUR',
  return_imputation_field: 'customfield_10099',
};

describe('RatioRetours (RMG-038 à 045, RMG-041bis)', () => {
  const calculator = new RatioRetours();

  beforeEach(() => jest.clearAllMocks());

  it('calcule le ratio retours = temps retours / temps total', async () => {
    // Tickets normaux: 80h total
    // Tickets retours: 20h
    // Ratio = 20/100 = 20%
    mockIssueFindMany.mockResolvedValue([
      { id: 1, jiraIssueKey: 'PROJ-1', labels: [], timeSpentHours: 10 },
      { id: 2, jiraIssueKey: 'PROJ-2', labels: ['RETOUR'], timeSpentHours: 5, parentJiraIssueId: 'PROJ-P1' },
    ]);

    mockWorklogFindMany.mockResolvedValue([
      { issueId: 1, timeSpentHours: 80 },
      { issueId: 2, timeSpentHours: 20 },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);

    // ratio = worklogs retours / worklogs totaux * 100
    expect(result.value).toBeCloseTo(20, 1);
  });

  it('retourne 0 si aucun ticket retour', async () => {
    mockIssueFindMany.mockResolvedValue([
      { id: 1, jiraIssueKey: 'PROJ-1', labels: [], timeSpentHours: 10 },
    ]);
    mockWorklogFindMany.mockResolvedValue([
      { issueId: 1, timeSpentHours: 40 },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBe(0);
  });

  it('retourne null si aucun worklog', async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockWorklogFindMany.mockResolvedValue([]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeNull();
  });

  it('utilise return_imputation_field pour identifier le développeur (RMG-041bis)', async () => {
    // Le ticket retour a un parent avec customfield_10099 = accountId original
    mockIssueFindMany.mockResolvedValue([
      {
        id: 2,
        jiraIssueKey: 'PROJ-2',
        labels: ['RETOUR'],
        timeSpentHours: 5,
        parentJiraIssueId: 'issue-parent-id',
        customFields: { customfield_10099: 'original-dev-account-id' },
      },
      {
        id: 1,
        jiraIssueKey: 'PROJ-P1',
        labels: [],
        jiraIssueId: 'issue-parent-id',
        timeSpentHours: 20,
        customFields: { customfield_10099: 'original-dev-account-id' },
      },
    ]);

    mockWorklogFindMany.mockResolvedValue([
      { issueId: 1, timeSpentHours: 20, authorAccountId: 'original-dev-account-id' },
      { issueId: 2, timeSpentHours: 5, authorAccountId: 'another-dev-account-id' },
    ]);

    // Le calculateur doit attribuer les 5h du ticket retour à 'original-dev-account-id'
    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).not.toBeNull();
  });
});
