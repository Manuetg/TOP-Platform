export class ResourceLimitReachedError extends Error {
  constructor() { super('Alcanzaste el límite de recursos de tu plan. Solicitá una ampliación para agregar más.'); }
}
export interface ResourceUsage {
  used: number;
  available: number;
  percentage: number;
  state: 'NORMAL' | 'WARNING' | 'LIMIT';
  canCreate: boolean;
}
export function resourceUsage(used: number, maximum: number): ResourceUsage {
  if (!Number.isSafeInteger(maximum) || maximum <= 0 || !Number.isSafeInteger(used) || used < 0) throw new Error('La configuración del cupo no es válida.');
  return { used, available: Math.max(0, maximum - used), percentage: Math.round(used * 100 / maximum), state: used >= maximum ? 'LIMIT' as const : used * 100 >= maximum * 80 ? 'WARNING' as const : 'NORMAL' as const, canCreate: used < maximum };
}
export function assertResourceCapacity(used: number, maximum: number): void {
  if (!resourceUsage(used, maximum).canCreate) throw new ResourceLimitReachedError();
}
