import { assertResourceCapacity, resourceUsage, ResourceLimitReachedError } from './resource-entitlement';

describe('Cupo de Resources', () => {
  it.each([[0, 10, 'NORMAL', 10, true], [7, 10, 'NORMAL', 3, true], [8, 10, 'WARNING', 2, true], [9, 10, 'WARNING', 1, true], [10, 10, 'LIMIT', 0, false], [12, 10, 'LIMIT', 0, false]] as const)('proyecta %s de %s sin ocultar exceso existente', (used, maximum, state, available, canCreate) => {
    expect(resourceUsage(used, maximum)).toEqual({ used, available, state, canCreate, percentage: used * 10 });
  });
  it.each([0, -1, 1.5, NaN, Infinity])('falla cerrado ante cupo inválido %s', (maximum) => { expect(() => resourceUsage(0, maximum)).toThrow(); });
  it.each([-1, 1.5, NaN])('rechaza uso inválido %s', (used) => { expect(() => resourceUsage(used, 10)).toThrow(); });
  it('rechaza límite y permite el último lugar libre', () => { expect(() => assertResourceCapacity(9, 10)).not.toThrow(); expect(() => assertResourceCapacity(10, 10)).toThrow(ResourceLimitReachedError); });
});
