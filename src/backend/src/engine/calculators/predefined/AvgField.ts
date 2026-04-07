import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';
import { SumField } from './SumField';

/**
 * KPI : Moyenne d'un champ numérique (AVG_FIELD)
 * Réutilise SumField puis divise par le nombre de tickets.
 */
export class AvgField implements KpiCalculator {
  private sumField = new SumField();

  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const result = await this.sumField.calculate(config, context);
    if (result.ticketCount === 0 || result.value === null) return EMPTY_RESULT;

    return {
      ...result,
      value: Math.round((result.value / result.ticketCount) * 100) / 100,
    };
  }
}
