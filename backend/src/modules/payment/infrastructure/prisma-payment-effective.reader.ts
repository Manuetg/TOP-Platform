import type { Prisma } from '@prisma/client';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { PaymentAdjustmentInvariantError } from '../domain/payment-adjustment.rules';

export interface EffectiveAmountsProjection {
  grossRecordedAmountMinor: number;
  voidedAmountMinor: number;
  refundedAmountMinor: number;
  netRetainedAmountMinor: number;
  financialVersion: number;
}

export interface EffectivePaymentProjection extends Omit<EffectiveAmountsProjection, 'financialVersion'> {
  paymentId: string;
  businessId: string;
  bookingId: string;
  currency: string;
  paymentVersion: number;
}

interface EffectivePaymentRow {
  paymentId: string;
  businessId: string;
  bookingId: string;
  currency: string;
  grossRecordedAmountMinor: bigint;
  voidedAmountMinor: bigint;
  refundedAmountMinor: bigint;
  netRetainedAmountMinor: bigint;
  paymentVersion: bigint;
  invalidMonetaryData: boolean;
  applicationInvalid: boolean;
}

/** SQL views own adjustment arithmetic. This adapter only validates and converts. */
export async function readEffectivePayments(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[], paymentIds?: string[]): Promise<EffectivePaymentProjection[]> {
  if (bookingIds.length === 0) return [];
  const rows = await transaction.$queryRaw<EffectivePaymentRow[]>`
    SELECT state.*, COALESCE(app.invalid, FALSE) OR COALESCE(app.applied, 0) > state."netRetainedAmountMinor" AS "applicationInvalid"
    FROM "PaymentEffectiveState" state
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(application."effectiveAmountMinor"), 0) AS applied,
        COALESCE(BOOL_OR(application."invalidMonetaryData" OR application."businessId" <> state."businessId"
          OR application."bookingId" <> state."bookingId" OR application.currency <> state.currency
          OR application."effectiveAmountMinor" < 0 OR application."effectiveAmountMinor" > application."originalAmountMinor"), FALSE) AS invalid
      FROM "PaymentApplicationEffective" application WHERE application."paymentId" = state."paymentId"
    ) app ON TRUE
    WHERE state."businessId" = ${businessId} AND state."bookingId" = ANY(${bookingIds}::text[])
      AND (${paymentIds ?? null}::text[] IS NULL OR state."paymentId" = ANY(${paymentIds ?? null}::text[]))
    ORDER BY state."bookingId", state."paymentId"
  `;
  return rows.map(mapEffectivePayment);
}

function mapEffectivePayment(row: EffectivePaymentRow): EffectivePaymentProjection {
  requirePaymentRanges(row);
  if (row.invalidMonetaryData || row.applicationInvalid) {
    throw new PaymentAdjustmentInvariantError('El cobro y sus aplicaciones efectivas son inconsistentes.');
  }
  return {
    paymentId: row.paymentId, businessId: row.businessId, bookingId: row.bookingId, currency: row.currency,
    grossRecordedAmountMinor: fromPrismaMoney(row.grossRecordedAmountMinor),
    voidedAmountMinor: fromPrismaMoney(row.voidedAmountMinor),
    refundedAmountMinor: fromPrismaMoney(row.refundedAmountMinor),
    netRetainedAmountMinor: fromPrismaMoney(row.netRetainedAmountMinor),
    paymentVersion: fromPrismaMoney(row.paymentVersion),
  };
}

function requirePaymentRanges(row: EffectivePaymentRow): void {
  if (row.grossRecordedAmountMinor <= 0n || row.netRetainedAmountMinor < 0n || row.netRetainedAmountMinor > row.grossRecordedAmountMinor) throw new PaymentAdjustmentInvariantError('El importe efectivo del cobro está fuera de rango.');
  if (row.voidedAmountMinor < 0n || row.refundedAmountMinor < 0n || row.paymentVersion < 1n) throw new PaymentAdjustmentInvariantError('El ajuste o su versión está fuera de rango.');
}

export function summarizeEffectivePayments(payments: readonly EffectivePaymentProjection[], currency: string): EffectiveAmountsProjection {
  if (payments.some((payment) => payment.currency !== currency)) throw new PaymentAdjustmentInvariantError('La moneda de los cobros efectivos no coincide con el precio.');
  const sum = (key: 'grossRecordedAmountMinor' | 'voidedAmountMinor' | 'refundedAmountMinor' | 'netRetainedAmountMinor' | 'paymentVersion') => fromPrismaMoney(payments.reduce((total, payment) => total + BigInt(payment[key]), 0n));
  return { grossRecordedAmountMinor: sum('grossRecordedAmountMinor'), voidedAmountMinor: sum('voidedAmountMinor'), refundedAmountMinor: sum('refundedAmountMinor'), netRetainedAmountMinor: sum('netRetainedAmountMinor'), financialVersion: sum('paymentVersion') };
}

export async function readBookingEffectiveAmounts(transaction: Prisma.TransactionClient, businessId: string, bookingId: string, currency: string): Promise<EffectiveAmountsProjection> {
  return summarizeEffectivePayments(await readEffectivePayments(transaction, businessId, [bookingId]), currency);
}

export interface EffectiveApplicationProjection {
  paymentId: string;
  installmentId: string;
  originalAmountMinor: number;
  reversedAmountMinor: number;
  effectiveAmountMinor: number;
  dueDate: Date | null;
  sortOrder: number;
}

interface ApplicationRow extends Omit<EffectiveApplicationProjection, 'originalAmountMinor' | 'reversedAmountMinor' | 'effectiveAmountMinor'> {
  originalAmountMinor: bigint;
  reversedAmountMinor: bigint;
  effectiveAmountMinor: bigint;
  invalidMonetaryData: boolean;
  scoped: boolean;
}

export async function readEffectiveApplications(transaction: Prisma.TransactionClient, businessId: string, bookingId: string, paymentId?: string): Promise<EffectiveApplicationProjection[]> {
  const rows = await transaction.$queryRaw<ApplicationRow[]>`
    SELECT application."paymentId", application."installmentId", application."originalAmountMinor", application."reversedAmountMinor", application."effectiveAmountMinor", application."invalidMonetaryData",
      installment."dueDate", installment."sortOrder", plan."businessId" = ${businessId} AND plan."bookingId" = ${bookingId} AS scoped
    FROM "PaymentApplicationEffective" application
    INNER JOIN "PaymentPlanInstallment" installment ON installment.id = application."installmentId"
    INNER JOIN "PaymentPlan" plan ON plan.id = installment."paymentPlanId"
    WHERE application."businessId" = ${businessId} AND application."bookingId" = ${bookingId}
      AND (${paymentId ?? null}::text IS NULL OR application."paymentId" = ${paymentId ?? null})
    ORDER BY application."paymentId", installment."sortOrder", installment.id
  `;
  return rows.map((row) => {
    if (row.invalidMonetaryData || !row.scoped || row.originalAmountMinor <= 0n || row.reversedAmountMinor < 0n || row.effectiveAmountMinor < 0n || row.effectiveAmountMinor > row.originalAmountMinor) throw new PaymentAdjustmentInvariantError('Las aplicaciones efectivas no conservan su origen.');
    return { paymentId: row.paymentId, installmentId: row.installmentId, dueDate: row.dueDate, sortOrder: row.sortOrder, originalAmountMinor: fromPrismaMoney(row.originalAmountMinor), reversedAmountMinor: fromPrismaMoney(row.reversedAmountMinor), effectiveAmountMinor: fromPrismaMoney(row.effectiveAmountMinor) };
  });
}
