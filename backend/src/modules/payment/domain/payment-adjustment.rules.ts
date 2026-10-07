export class PaymentAdjustmentInputError extends Error {}
export class PaymentAdjustmentConflictError extends Error {}
export class PaymentAdjustmentInvariantError extends Error {}
export class PaymentAdjustmentForbiddenError extends Error {}
export class PaymentAdjustmentNotFoundError extends Error {}

export interface EffectiveApplicationForRelease {
  installmentId: string;
  dueDate: string | null;
  sortOrder: number;
  effectiveAmountMinor: number;
}

export interface ApplicationRelease {
  installmentId: string;
  amountMinor: number;
}

function safeMoney(value: number, positive = false): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) {
    throw new PaymentAdjustmentInvariantError('Los importes efectivos deben ser enteros seguros.');
  }
  return BigInt(value);
}

function safeNumber(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new PaymentAdjustmentInvariantError('El acumulado monetario excede el rango seguro.');
  return amount;
}

function requireApplications(applications: readonly EffectiveApplicationForRelease[]): void {
  const ids = new Set<string>();
  for (const row of applications) {
    if (!row.installmentId || ids.has(row.installmentId) || !Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0) {
      throw new PaymentAdjustmentInvariantError('Las aplicaciones efectivas no conservan una clave y orden válidos.');
    }
    if (row.dueDate !== null && !validPureDate(row.dueDate)) throw new PaymentAdjustmentInvariantError('El vencimiento de la cuota es inválido.');
    safeMoney(row.effectiveAmountMinor);
    ids.add(row.installmentId);
  }
}

function validPureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Inverse of application priority: null first, then dueDate/sortOrder/id DESC. */
export function compareApplicationsForRelease(left: EffectiveApplicationForRelease, right: EffectiveApplicationForRelease): number {
  const date = compareReleaseDates(left.dueDate, right.dueDate);
  if (date !== 0) return date;
  if (left.sortOrder !== right.sortOrder) return left.sortOrder > right.sortOrder ? -1 : 1;
  return left.installmentId === right.installmentId ? 0 : left.installmentId > right.installmentId ? -1 : 1;
}

function compareReleaseDates(left: string | null, right: string | null): number {
  if (left === null && right !== null) return -1;
  if (left !== null && right === null) return 1;
  return left === right ? 0 : (left ?? '') > (right ?? '') ? -1 : 1;
}

/** Releases only this original Payment's applications, after its unallocated credit. */
export function planApplicationRelease(netRetainedAmountMinor: number, adjustmentAmountMinor: number, applications: readonly EffectiveApplicationForRelease[]): ApplicationRelease[] {
  const net = safeMoney(netRetainedAmountMinor);
  const adjustment = safeMoney(adjustmentAmountMinor, true);
  requireApplications(applications);
  const applied = applications.reduce((sum, row) => sum + BigInt(row.effectiveAmountMinor), 0n);
  if (applied > net) throw new PaymentAdjustmentInvariantError('Las aplicaciones exceden el neto del cobro original.');
  if (adjustment > net) throw new PaymentAdjustmentConflictError('El ajuste excede el neto disponible del cobro original.');
  safeNumber(applied);
  const unallocated = net - applied;
  const release = adjustment > unallocated ? adjustment - unallocated : 0n;
  return allocateRelease(release, applications);
}

function allocateRelease(amount: bigint, applications: readonly EffectiveApplicationForRelease[]): ApplicationRelease[] {
  let remaining = amount;
  const result: ApplicationRelease[] = [];
  for (const row of [...applications].sort(compareApplicationsForRelease)) {
    if (remaining === 0n) break;
    const available = BigInt(row.effectiveAmountMinor);
    const released = remaining < available ? remaining : available;
    if (released === 0n) continue;
    result.push({ installmentId: row.installmentId, amountMinor: safeNumber(released) });
    remaining -= released;
  }
  if (remaining !== 0n) throw new PaymentAdjustmentInvariantError('No se pudo liberar el importe exacto de aplicaciones.');
  return result;
}

export function validatePaymentAdjustmentReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 500) {
    throw new PaymentAdjustmentInputError('El motivo debe contener entre 2 y 500 caracteres.');
  }
  return value.trim();
}

export function validatePaymentAdjustmentReference(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > 120) throw new PaymentAdjustmentInputError('La referencia admite hasta 120 caracteres.');
  return value.trim() || null;
}

export function validateRefundAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new PaymentAdjustmentInputError('La devolución debe ser un entero positivo seguro.');
  return value;
}

export function validateRefundOccurredAt(value: unknown, paidAt: Date, now: Date): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new PaymentAdjustmentInputError('La fecha efectiva requiere un instante con zona horaria explícita.');
  }
  if (!validPureDate(value.slice(0, 10)) || !validClock(value)) throw new PaymentAdjustmentInputError('La fecha efectiva contiene un calendario u hora inválidos.');
  const occurredAt = new Date(value);
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt < paidAt || occurredAt > now) {
    throw new PaymentAdjustmentInputError('La fecha de devolución debe estar entre el cobro original y el instante actual.');
  }
  return occurredAt;
}

function validClock(value: string): boolean {
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return false;
  if (value.endsWith('Z')) return true;
  return Number(value.slice(-5, -3)) <= 23 && Number(value.slice(-2)) <= 59;
}
