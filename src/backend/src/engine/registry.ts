import { KpiCalculator } from './calculators/KpiCalculator';
import { RatioEstimeConsomme } from './calculators/predefined/RatioEstimeConsomme';
import { RatioRetours } from './calculators/predefined/RatioRetours';
import { CountByStatus } from './calculators/predefined/CountByStatus';
import { CountWithoutEstimate } from './calculators/predefined/CountWithoutEstimate';
import { CountWithAi } from './calculators/predefined/CountWithAi';
import { SumField } from './calculators/predefined/SumField';
import { AvgField } from './calculators/predefined/AvgField';

/**
 * CalculatorRegistry — mappe predefined_type → instance de calculator.
 *
 * Pour ajouter un nouveau type de formule prédéfinie :
 *   1. Créer un fichier dans src/engine/calculators/predefined/
 *   2. Ajouter une entrée ici
 *   C'est tout.
 */
const registry = new Map<string, KpiCalculator>([
  ['RATIO_ESTIME_CONSOMME', new RatioEstimeConsomme()],
  ['RATIO_RETOURS', new RatioRetours()],
  ['COUNT_BY_STATUS', new CountByStatus()],
  ['COUNT_WITHOUT_ESTIMATE', new CountWithoutEstimate()],
  ['COUNT_WITH_AI', new CountWithAi()],
  ['SUM_FIELD', new SumField()],
  ['AVG_FIELD', new AvgField()],
]);

export function getCalculator(predefinedType: string): KpiCalculator {
  const calculator = registry.get(predefinedType);
  if (!calculator) {
    throw new Error(`No calculator registered for predefined_type: "${predefinedType}"`);
  }
  return calculator;
}

export function hasCalculator(predefinedType: string): boolean {
  return registry.has(predefinedType);
}

export { registry };
