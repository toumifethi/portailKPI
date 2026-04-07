import { CountWithAi } from '@/engine/calculators/predefined/CountWithAi';
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
  done_statuses: ['Done'],
  ai_field_id: 'customfield_10050',
  aiRules: [
    { fieldValue: 'GitHub Copilot', rule: 'COMPTE_COMME_IA' },
    { fieldValue: 'Aucun', rule: 'NON_IA' },
    { fieldValue: 'Confidentiel', rule: 'EXCLUT' },
  ],
};

describe('CountWithAi (RMG-088 à 093)', () => {
  const calculator = new CountWithAi();

  beforeEach(() => jest.clearAllMocks());

  it('calcule le pourcentage de tickets avec IA', async () => {
    // 4 tickets : 2 IA, 1 non-IA, 1 exclu
    mockFindMany.mockResolvedValue([
      { id: 1, customFields: { customfield_10050: 'GitHub Copilot' } },
      { id: 2, customFields: { customfield_10050: 'GitHub Copilot' } },
      { id: 3, customFields: { customfield_10050: 'Aucun' } },
      { id: 4, customFields: { customfield_10050: 'Confidentiel' } },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);

    // 2 IA / 3 non-exclus = 66.67%
    expect(result.value).toBeCloseTo(66.67, 1);
    expect(result.ticketCount).toBe(3); // hors exclus
    expect(result.excludedTicketCount).toBe(1);
  });

  it('retourne 0% si aucun ticket avec IA', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, customFields: { customfield_10050: 'Aucun' } },
      { id: 2, customFields: { customfield_10050: 'Aucun' } },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBe(0);
  });

  it('retourne null si tous les tickets sont exclus', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, customFields: { customfield_10050: 'Confidentiel' } },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeNull();
    expect(result.ticketCount).toBe(0);
    expect(result.excludedTicketCount).toBe(1);
  });

  it("retourne null si aucun ticket dans la période", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeNull();
  });

  it('traite les tickets sans valeur dans le champ IA comme NON_IA', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, customFields: {} }, // pas de champ IA
      { id: 2, customFields: { customfield_10050: 'GitHub Copilot' } },
    ]);

    const result = await calculator.calculate(baseConfig, baseContext);
    expect(result.value).toBeCloseTo(50, 1);
  });
});
