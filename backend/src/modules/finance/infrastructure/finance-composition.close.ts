import type { Prisma } from '@prisma/client';
import { readPaymentClosingSources, type PaymentClosingSources } from '../../payment/payment.contract';
import { listFinanceServiceEvidence } from '../../booking/booking.contract';
import type { CloseJson, FinancialSourceRef } from '../domain/finance-close.types';
import type { FinanceCloseSupplementReader, FinanceCloseSupplement } from './finance-recognition.readers';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { recognitionHash, recognitionJson } from './finance-recognition.db';
import { readFinanceV2CloseSources } from './finance-v2-close.reader';
import { adaptTransaction } from './finance-v2-prisma-sql.adapter';
import { bankLocalDate } from './finance-v2-bank-source.sql-reader';
import { financeJsonRecord, financeJsonRows } from './finance-composition.public';
import { readFinanceEvidenceCloseSources } from './finance-evidence-close.reader';

type CloseInput = { businessId: string; from: string; to: string; asOf: string };

/** Payload preserves provenance; only facts affecting this period become mutation guards. */
export const financeCloseSupplementReader: FinanceCloseSupplementReader = { read: readFinanceCloseSupplement };

export async function readFinanceCloseSupplement(tx: Prisma.TransactionClient, input: CloseInput): Promise<FinanceCloseSupplement> {
  const [payment, finance, businesses, bookings, files] = await Promise.all([
    readPaymentClosingSources(tx, input.businessId, new Date(input.asOf)),
    readFinanceV2CloseSources(adaptTransaction(tx), input),
    tx.business.findMany({ where: { id: input.businessId }, select: { timezone: true }, take: 1 }),
    listFinanceServiceEvidence(tx, { ...input, limit: 5000 }),
    readFinanceEvidenceCloseSources(adaptTransaction(tx), input),
  ]);
  if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
  const serviceBookingIds = new Set(bookings.filter(row => row.checkInDate !== null && row.checkOutDate !== null && row.checkInDate < input.to && row.checkOutDate > input.from).map(row => row.bookingId));
  const paymentRefs = paymentPeriodReferences(payment, input, businesses[0].timezone, serviceBookingIds);
  const sourceRefs = normalizeFinanceGuardReferences([...paymentRefs, ...finance.guardSourceRefs, ...files.guardSourceRefs]);
  const sourceCount = payment.sourceRefs.length + finance.sourceCount + files.sourceCount;
  if (sourceCount > 5000) throw new FinanceConflictError('El suplemento completo supera 5000 fuentes; no se trunca.');
  const complete = payment.complete && finance.complete;
  const missingSources = payment.complete ? [] : ['PAYMENT_PLAN_AS_OF_HISTORY_UNAVAILABLE'];
  const payload = recognitionJson({ payment: payment.payload, financeV2: finance.payload, evidenceFiles: files.payload, guardSourceRefs: sourceRefs }) as CloseJson;
  return { payload, sourceRefs, sourceCount, complete, missingSources, sourceToken: recognitionHash({ paymentToken: payment.sourceToken, financeToken: finance.token, files: files.payload, sourceRefs, complete, missingSources }) };
}

export function normalizeFinanceGuardReferences(refs: readonly FinancialSourceRef[]): FinancialSourceRef[] {
  const normalized = refs.map(row => ({ ...row, type: ['LABOR_ESTIMATE', 'OWNER_IMPUTED'].includes(row.type) ? 'LABOR_REVISION' : row.type }));
  return [...new Map(normalized.map(row => [`${row.type}:${row.id}`, row])).values()].sort((left, right) => `${left.type}:${left.id}` < `${right.type}:${right.id}` ? -1 : 1);
}

export function paymentPeriodReferences(source: PaymentClosingSources, input: Pick<CloseInput, 'from' | 'to'>, timeZone: string, serviceBookingIds: ReadonlySet<string>): FinancialSourceRef[] {
  const payload = financeJsonRecord(source.payload);
  const selected = new Map<string, Set<string>>();
  const rows = (key: string) => financeJsonRows(payload[key]);
  const ids = (type: string): Set<string> => { const current = selected.get(type) ?? new Set<string>(); selected.set(type, current); return current; };
  const beforeTo = (value: Prisma.JsonValue | undefined) => typeof value === 'string' && bankLocalDate(value, timeZone) < input.to;
  const inPeriod = (value: Prisma.JsonValue | undefined) => typeof value === 'string' && bankLocalDate(value, timeZone) >= input.from && bankLocalDate(value, timeZone) < input.to;
  const select = (type: string, key: string, predicate: (row: Record<string, Prisma.JsonValue>) => boolean, id: (row: Record<string, Prisma.JsonValue>) => string = row => sourceId(row.id)): void => { rows(key).filter(predicate).forEach(row => ids(type).add(id(row))); };
  const applicationId = (row: Record<string, Prisma.JsonValue>) => `${sourceId(row.paymentId)}:${sourceId(row.installmentId)}`;
  select('PAYMENT', 'payments', row => beforeTo(row.paidAt));
  select('PAYMENT_PLAN', 'installments', row => typeof row.dueDate === 'string' && row.dueDate >= input.from && row.dueDate < input.to, row => sourceId(row.paymentPlanId));
  select('PAYMENT_PLAN', 'paymentPlans', row => serviceBookingIds.has(sourceId(row.bookingId)));
  select('PAYMENT_INSTALLMENT', 'installments', row => ids('PAYMENT_PLAN').has(sourceId(row.paymentPlanId)));
  select('PAYMENT_APPLICATION', 'applications', row => ids('PAYMENT_INSTALLMENT').has(sourceId(row.installmentId)) || inPeriod(row.createdAt), applicationId);
  select('PAYMENT_ADJUSTMENT', 'adjustments', row => beforeTo(row.occurredAt));
  select('PAYMENT_APPLICATION_REVERSAL', 'applicationReversals', row => ids('PAYMENT_ADJUSTMENT').has(sourceId(row.adjustmentId)) && ids('PAYMENT_APPLICATION').has(applicationId(row)));
  return source.sourceRefs.filter(ref => selected.get(ref.type)?.has(ref.id));
}

function sourceId(value: Prisma.JsonValue | undefined): string {
  if (typeof value !== 'string' || !value) throw new FinanceConflictError('La referencia pública de cierre no es válida.');
  return value;
}
