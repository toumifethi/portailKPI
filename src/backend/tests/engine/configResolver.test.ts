import { resolveConfig } from '@/engine/configResolver';

describe('resolveConfig', () => {
  it('retourne la baseConfig si pas de configOverride', () => {
    const base = { done_statuses: ['Done', 'Closed'], aggregation_rule: 'AVG' };
    const result = resolveConfig(base, undefined);
    expect(result).toEqual(base);
  });

  it('merge les overrides — le client gagne sur les conflits (RMG-104)', () => {
    const base = { done_statuses: ['Done'], aggregation_rule: 'AVG', threshold: 10 };
    const override = { done_statuses: ['Done', 'Résolu'], threshold: 20 };
    const result = resolveConfig(base, override);
    expect(result.done_statuses).toEqual(['Done', 'Résolu']);
    expect(result.threshold).toBe(20);
    expect(result.aggregation_rule).toBe('AVG'); // non overridé
  });

  it('merge profond sur les objets imbriqués', () => {
    const base = { nested: { a: 1, b: 2 } };
    const override = { nested: { b: 99, c: 3 } };
    const result = resolveConfig(base, override);
    expect(result.nested).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('un override null supprime la valeur', () => {
    const base = { done_statuses: ['Done'], extra: 'value' };
    const override = { extra: null };
    const result = resolveConfig(base, override as Record<string, unknown>);
    expect(result.extra).toBeNull();
  });

  it('retourne la baseConfig si configOverride est un objet vide', () => {
    const base = { done_statuses: ['Done'] };
    const result = resolveConfig(base, {});
    expect(result).toEqual(base);
  });
});
