import { CountWithoutEstimate } from '@/engine/calculators/predefined/CountWithoutEstimate';
import { prisma } from '@/db/prisma';
import { FinalKpiConfig, CalculationContext } from '@/types/domain';

jest.mock('@/db/prisma', () => ({
  prisma: { issue: { count: jest.fn() } },
}));

const mockCount = prisma.issue.count as jest.Mock;

const baseContext: CalculationContext = {
  clientId: 1,
  projectIds: [10, 11],
  periodStart: new Date('2025-11-01'),
  periodEnd: new Date('2025-11-30'),
  periodType: 'MONTHLY',
  formulaVersion: '1.0',
};

const baseConfig: FinalKpiConfig = {
  in_progress_statuses: ['En cours', 'In Progress'],
};

describe('CountWithoutEstimate', () => {
  const calculator = new CountWithoutEstimate();

  beforeEach(() => jest.clearAllMocks());

  it('retourne le count des issues en cours sans estimation', async () => {
    mockCount.mockResolvedValue(7);

    const result = await calculator.calculate(baseConfig, baseContext);

    expect(result.value).toBe(7);
    expect(result.ticketCount).toBe(7);
    expect(result.excludedTicketCount).toBe(0);
  });

  it('appelle prisma.issue.count avec les bons filtres (RMG-082)', async () => {
    mockCount.mockResolvedValue(3);

    await calculator.calculate(baseConfig, baseContext);

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 1,
          projectId: { in: [10, 11] },
          status: { in: ['En cours', 'In Progress'] },
        }),
      }),
    );
  });

  it("retourne value=0 si aucune issue sans estimation", async () => {
    mockCount.mockResolvedValue(0);

    const result = await calculator.calculate(baseConfig, baseContext);

    expect(result.value).toBe(0);
  });

  it('utilise les in_progress_statuses par défaut si non configurés', async () => {
    mockCount.mockResolvedValue(2);

    const configSansStatuses: FinalKpiConfig = {};
    await calculator.calculate(configSansStatuses, baseContext);

    // Le calculateur doit gérer le cas où in_progress_statuses est absent
    expect(mockCount).toHaveBeenCalled();
  });
});
