import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';

/**
 * Interface Strategy — tout calculator KPI doit l'implémenter.
 *
 * Pattern Strategy (cf. DA-008) :
 * - Un fichier par type de formule dans src/engine/calculators/predefined/
 * - Ajouter/corriger une formule = modifier un seul fichier
 * - Le CalculatorRegistry mappe predefined_type → instance
 */
export interface KpiCalculator {
  /**
   * Calcule le KPI pour une combinaison (client, période, user/project).
   *
   * @param config   Configuration finale fusionnée (base_config + config_override)
   * @param context  Contexte de calcul (client, période, connexion DB)
   */
  calculate(
    config: FinalKpiConfig,
    context: CalculationContext,
  ): Promise<KpiCalculationResult>;
}

export const EMPTY_RESULT: KpiCalculationResult = {
  value: null,
  ticketCount: 0,
  excludedTicketCount: 0,
  excludedTicketDetails: [],
};
