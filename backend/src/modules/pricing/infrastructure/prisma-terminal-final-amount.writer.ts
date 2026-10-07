import { Prisma } from '@prisma/client';
import { AuthorizationPolicy } from '../../../shared/application/authorization-policy';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { appendBookingTimelineEvent } from '../../booking/booking.contract';
import type { MembershipRole } from '../../identity/identity.contract';
import { readCurrentPricing, readServicePricing, type ServicePricing } from './prisma-current-pricing.reader';
import type { CurrentPricing } from '../domain/current-pricing';
import { requireTerminalAgreement, TerminalFinalAmountConflictError, TerminalFinalAmountForbiddenError, TerminalFinalAmountNotFoundError, validateTerminalInput, type TerminalFinalAmountInput, type TerminalFinalAmountResult } from '../domain/terminal-final-amount';

interface EffectiveRow { currency: string; grossRecordedAmountMinor: bigint; voidedAmountMinor: bigint; refundedAmountMinor: bigint; netRetainedAmountMinor: bigint; paymentVersion: bigint; invalidMonetaryData: boolean; applicationInvalid: boolean; }
type TerminalBooking = Prisma.BookingGetPayload<{ include: { resources: true } }>;

export async function appendTerminalFinalAmount(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput): Promise<TerminalFinalAmountResult> {
  const reason = validateTerminalInput(input);
  await authorizeActor(transaction, input);
  const booking = await lockTerminalBooking(transaction, input);
  await transaction.$queryRaw`SELECT id FROM "PricingSnapshot" WHERE "bookingId"=${input.bookingId} AND "businessId"=${input.businessId} FOR UPDATE`;
  const { current, service } = await requireTerminalPricing(transaction, input);
  requireTerminalAgreement(booking.status, booking.resources.map((resource) => resource.resourceId), service.items.map((item) => item.resourceId));
  const amounts = await readEffectiveAmounts(transaction, input);
  if (input.expectedBookingUpdatedAt !== booking.updatedAt.toISOString() || input.currentPricingId !== current.id || input.expectedFinancialVersion !== amounts.financialVersion) throw new TerminalFinalAmountConflictError('La reserva, el precio o los cobros cambiaron; actualice la información antes de confirmar.');
  const previousKind = await readCurrentPricingKind(transaction, input, current);
  const context = terminalContext(booking, current.id, service.id, amounts);
  const revisionNumber = current.revisionNumber + 1;
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber > 2147483647) throw new TerminalFinalAmountConflictError('La secuencia de revisiones excede el rango disponible.');
  await requireOpenTerminalPeriod(transaction, input.businessId, current.id, previousKind);
  const revision = await transaction.pricingRevision.create({ data: {
    businessId: input.businessId, bookingId: input.bookingId, originalSnapshotId: current.originalSnapshotId,
    kind: 'TERMINAL_FINAL_AMOUNT', requestId: input.requestId, revisionNumber, currency: 'PYG', totalAmountMinor: toPrismaMoney(input.finalAmountMinor), items: [],
    previousPricing: { id: current.id, kind: previousKind, currency: current.currency, totalAmountMinor: current.totalAmountMinor, items: current.items } as unknown as Prisma.InputJsonValue,
    beforeContext: context, afterContext: { ...context, finalAmountMinor: input.finalAmountMinor },
    paidAmountMinorAtSave: toPrismaMoney(amounts.netRetainedAmountMinor), actorUserId: input.actorUserId, reason,
  }, select: { id: true } });
  const updatedAt = new Date(Math.max(Date.now(), booking.updatedAt.getTime() + 1));
  await transaction.booking.update({ where: { id: input.bookingId }, data: { updatedAt } });
  await appendBookingTimelineEvent(transaction, { businessId: input.businessId, bookingId: input.bookingId, actorUserId: input.actorUserId, type: 'BOOKING_FINAL_AMOUNT_CONFIRMED', details: { revisionId: revision.id } });
  return { id: revision.id, type: 'SET_TERMINAL_FINAL_AMOUNT' as const, version: revisionNumber, bookingId: input.bookingId, currentPricingId: revision.id, pricingRevisionId: revision.id, revisionNumber, totalAmountMinor: input.finalAmountMinor, financialVersion: amounts.financialVersion, amounts, bookingUpdatedAt: updatedAt.toISOString() };
}

async function requireTerminalPricing(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput): Promise<{ current: CurrentPricing; service: ServicePricing }> {
  const [current, service] = await Promise.all([readCurrentPricing(transaction, input.businessId, input.bookingId), readServicePricing(transaction, input.businessId, input.bookingId)]);
  if (!current || !service || current.currency !== 'PYG' || service.currency !== 'PYG') throw new TerminalFinalAmountConflictError('La reserva requiere un precio de servicio persistido en PYG.');
  return { current, service };
}

async function readCurrentPricingKind(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput, current: CurrentPricing): Promise<'SERVICE' | 'TERMINAL_FINAL_AMOUNT'> {
  if (!current.pricingRevisionId) return 'SERVICE';
  const revision = await transaction.pricingRevision.findFirst({ where: { id: current.pricingRevisionId, businessId: input.businessId, bookingId: input.bookingId }, select: { kind: true } });
  if (!revision || !['SERVICE', 'TERMINAL_FINAL_AMOUNT'].includes(revision.kind)) throw new TerminalFinalAmountConflictError('La revisión vigente no está disponible.');
  return revision.kind as 'SERVICE' | 'TERMINAL_FINAL_AMOUNT';
}

function terminalContext(booking: TerminalBooking, currentPricingId: string, servicePricingId: string, amounts: Awaited<ReturnType<typeof readEffectiveAmounts>>) {
  return { status: booking.status, contactId: booking.contactId, checkInDate: booking.checkInDate?.toISOString().slice(0, 10) ?? null, checkOutDate: booking.checkOutDate?.toISOString().slice(0, 10) ?? null, resourceIds: booking.resources.map((resource) => resource.resourceId), adults: booking.adults, children: booking.children, previousPricingId: currentPricingId, servicePricingId, financialVersion: amounts.financialVersion, financialAmounts: amounts };
}

async function requireOpenTerminalPeriod(transaction: Prisma.TransactionClient, businessId: string, currentPricingId: string, kind: 'SERVICE' | 'TERMINAL_FINAL_AMOUNT'): Promise<void> {
  const dates = await transaction.$queryRaw<{ date: string }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE timezone, 'YYYY-MM-DD') AS date FROM "Business" WHERE id=${businessId}`;
  if (!dates[0]) throw new TerminalFinalAmountConflictError('No se puede determinar la fecha local del importe final.');
  await assertFinancePeriodOpen(transaction, businessId, [dates[0].date], [{ type: kind === 'SERVICE' ? 'SERVICE_PRICING' : 'TERMINAL_PRICING', id: currentPricingId }]);
}

async function authorizeActor(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput): Promise<void> {
  const users = await transaction.$queryRaw<{ status: string }[]>`SELECT status FROM "User" WHERE id=${input.actorUserId} FOR SHARE`;
  const memberships = await transaction.$queryRaw<{ role: string }[]>`SELECT role FROM "UserBusinessMembership" WHERE "userId"=${input.actorUserId} AND "businessId"=${input.businessId} FOR SHARE`;
  if (users[0]?.status !== 'ACTIVE' || !memberships[0] || !new AuthorizationPolicy().isAllowed(memberships[0].role as MembershipRole, 'pricing.final-amount')) throw new TerminalFinalAmountForbiddenError('El actor no puede acordar un importe final en este negocio.');
}

async function lockTerminalBooking(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput) {
  await transaction.$queryRaw`SELECT id FROM "Booking" WHERE id=${input.bookingId} AND "businessId"=${input.businessId} FOR UPDATE`;
  const booking = await transaction.booking.findFirst({ where: { id: input.bookingId, businessId: input.businessId }, include: { resources: true } });
  if (!booking) throw new TerminalFinalAmountNotFoundError('La reserva no está disponible.');
  if (!['CANCELLED', 'NO_SHOW'].includes(booking.status) || booking.resources.length !== 1) throw new TerminalFinalAmountConflictError('El importe final requiere una reserva cancelada o no-show con el mismo recurso.');
  const businesses = await transaction.$queryRaw<{ status: string; currency: string }[]>`SELECT status,currency FROM "Business" WHERE id=${input.businessId} FOR SHARE`;
  if (!businesses[0] || businesses[0].status !== 'ACTIVE' || businesses[0].currency !== 'PYG') throw new TerminalFinalAmountConflictError('El negocio debe estar activo y operar en PYG.');
  return booking;
}

/** Canonical SQL projection avoids the Payment → Pricing dependency becoming cyclic. */
async function readEffectiveAmounts(transaction: Prisma.TransactionClient, input: TerminalFinalAmountInput) {
  const rows = await transaction.$queryRaw<EffectiveRow[]>`
    SELECT state.*, COALESCE(app.invalid, FALSE) OR COALESCE(app.applied, 0) > state."netRetainedAmountMinor" AS "applicationInvalid"
    FROM "PaymentEffectiveState" state
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(application."effectiveAmountMinor"), 0) AS applied,
        COALESCE(BOOL_OR(application."invalidMonetaryData" OR application."businessId" <> state."businessId"
          OR application."bookingId" <> state."bookingId" OR application.currency <> state.currency), FALSE) AS invalid
      FROM "PaymentApplicationEffective" application WHERE application."paymentId" = state."paymentId"
    ) app ON TRUE
    WHERE state."businessId" = ${input.businessId} AND state."bookingId" = ${input.bookingId}
  `;
  if (rows.some((row) => row.currency !== 'PYG' || row.invalidMonetaryData || row.applicationInvalid || row.netRetainedAmountMinor < 0n || row.paymentVersion < 1n)) throw new TerminalFinalAmountConflictError('Los cobros efectivos de la reserva son inconsistentes.');
  const sum = (key: 'grossRecordedAmountMinor' | 'voidedAmountMinor' | 'refundedAmountMinor' | 'netRetainedAmountMinor' | 'paymentVersion') => fromPrismaMoney(rows.reduce((total, row) => total + row[key], 0n));
  return { grossRecordedAmountMinor: sum('grossRecordedAmountMinor'), voidedAmountMinor: sum('voidedAmountMinor'), refundedAmountMinor: sum('refundedAmountMinor'), netRetainedAmountMinor: sum('netRetainedAmountMinor'), financialVersion: sum('paymentVersion') };
}
