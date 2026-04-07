import { RatioEstimeConsomme } from '@/engine/calculators/predefined/RatioEstimeConsomme';
import { prisma } from '@/db/prisma';
import { FinalKpiConfig, CalculationContext } from '@/types/domain';

jest.mock('@/db/prisma', () => ({
  prisma: { issue: { findMany: jest.fn() } },
}));

const mockFindMany = prisma.issue.findMany as jest.Mock;

const baseContext: CalculationContext = {
  clientId: 1,
  projectIds: [10],
  periodStart: new Date('2025-11-01'),
  periodEnd: new Date('2025-11-30'),
  periodType: 'MONTHLY',
  formulaVersion: '1.0',
};

const baseConfig: FinalKpiConfig = {
  done_statuses: ['Done', 'Fermé'],
  aggregation_rule: 'AVG',
};

describe('RatioEstimeConsomme (RMG-030 à 037)', () => {
  const calculator = new RatioEstimeConsomme();

  beforeEach(() => jest.clearAllMocks());

  it('calcule le ratio moyen estimé/consommé', async () => {
    // ticket A : estimé 10h, consommé 12h → ratio = (12-10)/10 * 100 = +20%
    // ticket B : estimé 8h, consommé 6h → ratio = (6-8)/8 * 100 = -25%
    mockFindMany.mockResolvedValue([
      { id: 1, originalEstimateHours: 10, timeSpentHours: 12 },
      { id: 2, originalEstimateHours: 8, timeSpentHours: 6 },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);

    // AVG = (20 + (-25)) / 2 = -2.5
    expect(result.value).toBeCloseTo(-2.5, 1);
    expect(result.ticketCount).toBe(2);
    expect(result.excludedTicketCount).toBe(0);
  });

  it('exclut les tickets sans estimation (RMG-032)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, originalEstimateHours: null, timeSpentHours: 10 },
      { id: 2, originalEstimateHours: 0, timeSpentHours: 5 },
      { id: 3, originalEstimateHours: 8, timeSpentHours: 8 },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);

    expect(result.value).toBe(0); // un seul ticket → ratio 0%
    expect(result.ticketCount).toBe(1);
    expect(result.excludedTicketCount).toBe(2);
  });

  it('retourne null si tous les tickets sont exclus', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, originalEstimateHours: null, timeSpentHours: 10 },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeNull();
    expect(result.excludedTicketCount).toBe(1);
  });

  it('retourne null si aucun ticket', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeNull();
  });

  it('applique aggregation_rule SUM si configuré (RMG-035)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, originalEstimateHours: 10, timeSpentHours: 12 }, // +20%
      { id: 2, originalEstimateHours: 8, timeSpentHours: 6 },   // -25%
    ]);

    const configSum: FinalKpiConfig = { ...baseConfig, aggregation_rule: 'SUM' };
    const result = await calculator.calculate(configSum, baseContext);

    // SUM = 20 + (-25) = -5
    expect(result.value).toBeCloseTo(-5, 1);
  });
});
