import merge from 'lodash.merge';
import { FinalKpiConfig } from '@/types/domain';

/**
 * Fusionne base_config (KpiDefinition) et config_override (KpiClientConfig).
 *
 * Règle : deep merge, les valeurs du client_override gagnent les conflits (cf. RMG-104).
 *
 * @param baseConfig     Valeurs par défaut définies sur le KPI
 * @param configOverride Surcharges spécifiques au client
 */
export function resolveConfig(
  baseConfig: Record<string, unknown>,
  configOverride: Record<string, unknown>,
): FinalKpiConfig {
  // lodash.merge effectue un deep merge en mutation sur une copie de baseConfig
  return merge({}, baseConfig, configOverride) as FinalKpiConfig;
}
