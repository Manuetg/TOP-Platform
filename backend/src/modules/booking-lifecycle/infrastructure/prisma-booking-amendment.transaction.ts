import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { assertBookingCapacity, assertDateRange, Booking, BookingNotFoundError, BookingStatus, InvalidBookingInputError } from '../../booking/booking.contract';
import { validateAvailabilityInTransaction } from '../../availability/availability.contract';
import { readCurrentPricing, type CurrentPricing } from '../../pricing/pricing.contract';
import { needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING } from '../../payment/payment.contract';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';
import { MembershipRole } from '../../identity/identity.contract';
import { BookingAmendmentConflictError, BookingAmendmentPermissionError, type AmendmentChanges, type AmendmentExpectation, type BookingAmendmentPreview, type BookingAmendmentTransaction, type BookingAmendmentTransactionInput } from '../booking-amendment.contract';
import { amendmentFinancialSummary, amendmentQuote, canonicalAmendmentJson } from './amendment-quote';

type BookingRow = Prisma.BookingGetPayload<{ include: { resources: true } }>;
interface BookingContext { contactId: string; checkInDate: Date; checkOutDate: Date; adults: number | null; children: number | null; notes: string | null; }
interface PreparedAmendment { booking: BookingRow; currentPricing: CurrentPricing; before: BookingContext; after: BookingContext; preview: BookingAmendmentPreview; }
const transactionOptions = { maxWait: 5000, timeout: 30000 };

@Injectable()
export class PrismaBookingAmendmentTransaction implements BookingAmendmentTransaction {
  constructor(private readonly prisma: PrismaService) {}

  preview(input: BookingAmendmentTransactionInput): Promise<BookingAmendmentPreview> {
    return this.prisma.$transaction(async (transaction) => (await this.prepare(transaction, input, false)).preview, transactionOptions);
  }

  save(input: BookingAmendmentTransactionInput, expectation: AmendmentExpectation): Promise<Booking> {
    return this.prisma.$transaction(async (transaction) => {
      const prepared = await this.prepare(transaction, input, true);
      this.requireExpectedPreview(prepared.preview, expectation);
      if (input.changes.pricing === undefined && canonicalAmendmentJson(this.context(prepared.before)) === canonicalAmendmentJson(this.context(prepared.after))) return this.booking(prepared.booking);
      const revisionId = input.changes.pricing === undefined ? null : await this.writeRevision(transaction, input, prepared);
      const updatedAt = new Date(Math.max(Date.now(), prepared.booking.updatedAt.getTime() + 1));
      const row = await transaction.booking.update({ where: { id: input.bookingId }, data: { ...prepared.after, updatedAt }, include: { resources: true } });
      await transaction.bookingTimelineEvent.create({ data: {
        businessId: input.businessId, bookingId: input.bookingId, type: 'BOOKING_AMENDED', actorUserId: input.actorUserId,
        details: {
          ...(input.changes.reason === null ? {} : { reason: input.changes.reason }),
          before: this.context(prepared.before), after: this.context(prepared.after),
          previousPricingId: prepared.currentPricing.id, pricingRevisionId: revisionId,
          previousTotalAmountMinor: prepared.currentPricing.totalAmountMinor,
          totalAmountMinor: prepared.preview.quote.totalAmountMinor,
          paidAmountMinor: prepared.preview.expectedPaidAmountMinor,
        },
      } });
      return this.booking(row);
    }, transactionOptions);
  }

  private async prepare(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, save: boolean): Promise<PreparedAmendment> {
    const booking = await this.lockedBooking(transaction, input, save);
    await this.actor(transaction, input);
    const currentPricing = await this.lockedPrice(transaction, input, save);
    const before = this.complete(booking);
    const after = { ...before, ...this.details(input.changes) };
    assertDateRange(after.checkInDate, after.checkOutDate);
    if (input.changes.pricing === undefined && this.datesChanged(before, after)) throw new InvalidBookingInputError('El cambio de fechas requiere un precio explícito calculado en el preview.');
    const resourceIds = booking.resources.map(({ resourceId }) => resourceId).sort();
    await this.available(transaction, input, after, resourceIds);
    const price = input.changes.pricing === undefined ? this.price(currentPricing) : await input.preparePricing(after, resourceIds);
    if (price.currency !== currentPricing.currency) throw new BookingAmendmentConflictError('La moneda propuesta no coincide con el precio vigente; la edición no convierte moneda.');
    const paidAmountMinor = await this.paid(transaction, input, price.currency);
    const quote = amendmentQuote(price, { businessId: input.businessId, bookingId: input.bookingId, currentPricingId: currentPricing.id, after: this.context(after), resourceIds, reason: input.changes.reason });
    const financialSummary = amendmentFinancialSummary(price.totalAmountMinor, paidAmountMinor);
    const warnings = await this.warnings(transaction, input, price, paidAmountMinor);
    return { booking, currentPricing, before, after, preview: {
      bookingId: booking.id, status: booking.status as BookingStatus, expectedUpdatedAt: booking.updatedAt.toISOString(), currentPricingId: currentPricing.id,
      expectedPaidAmountMinor: paidAmountMinor, currentPricing, quote, financialSummary,
      warnings,
    } };
  }

  private async lockedBooking(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, save: boolean): Promise<BookingRow> {
    const mode = save ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${input.bookingId} AND "businessId" = ${input.businessId} ${mode}`);
    const row = await transaction.booking.findFirst({ where: { id: input.bookingId, businessId: input.businessId }, include: { resources: true } });
    if (!row) throw new BookingNotFoundError('La reserva no existe.');
    if (!['PENDING', 'CONFIRMED'].includes(row.status)) throw new BookingAmendmentConflictError('La edición con precio está disponible para reservas pendientes o confirmadas.');
    if (row.resources.length !== 1) throw new BookingAmendmentConflictError('La edición requiere conservar exactamente el mismo recurso.');
    return row;
  }

  private async lockedPrice(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, save: boolean): Promise<CurrentPricing> {
    const mode = save ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "PricingSnapshot" WHERE "bookingId" = ${input.bookingId} AND "businessId" = ${input.businessId} ${mode}`);
    const price = await readCurrentPricing(transaction, input.businessId, input.bookingId);
    if (!price) throw new BookingAmendmentConflictError('La reserva requiere un precio acordado persistido.');
    return price;
  }

  private async actor(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.actorUserId} FOR SHARE`);
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "UserBusinessMembership" WHERE "userId" = ${input.actorUserId} AND "businessId" = ${input.businessId} FOR SHARE`);
    const user = await transaction.user.findUnique({ where: { id: input.actorUserId }, select: { status: true } });
    const membership = await transaction.userBusinessMembership.findUnique({ where: { userId_businessId: { userId: input.actorUserId, businessId: input.businessId } }, select: { role: true } });
    const policy = new AuthorizationPolicy();
    if (user?.status !== 'ACTIVE' || !membership || !policy.isAllowed(membership.role as MembershipRole, Capability.BOOKING_WRITE)) throw new BookingAmendmentPermissionError('El actor no puede modificar reservas en este negocio.');
    if (this.manualPrice(input.changes.pricing) && !policy.isAllowed(membership.role as MembershipRole, Capability.PRICING_OVERRIDE_CALCULATE)) throw new BookingAmendmentPermissionError('El actor no puede acordar un precio manual.');
  }

  private manualPrice(pricing: unknown): boolean {
    if (!Array.isArray(pricing)) return false;
    return pricing.some((value: unknown) => {
      if (typeof value !== 'object' || value === null) return false;
      const item = value as Record<string, unknown>;
      return item.pricingMode === 'MANUAL_NO_RATE_PLAN' || item.agreedAmountMinor !== undefined || item.overrideReason !== undefined;
    });
  }

  private async available(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, after: BookingContext, resourceIds: string[]): Promise<void> {
    for (const resourceId of resourceIds) await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resourceId}, 0))`);
    const availability = await validateAvailabilityInTransaction(transaction, {
      businessId: input.businessId, resourceIds, checkInDate: after.checkInDate.toISOString().slice(0, 10), checkOutDate: after.checkOutDate.toISOString().slice(0, 10), excludeBookingId: input.bookingId,
    });
    if (!availability.valid) throw new BookingAmendmentConflictError('La modificación tiene conflictos de disponibilidad.');
    const contact = await transaction.contact.findFirst({ where: { id: after.contactId, businessId: input.businessId }, select: { id: true } });
    if (!contact) throw new BookingAmendmentConflictError('El contacto no existe en el negocio.');
    const resource = await transaction.resource.findFirstOrThrow({ where: { id: resourceIds[0], businessId: input.businessId }, select: { capacityMaximum: true, capacityMaximumChildren: true } });
    assertBookingCapacity(after.adults, after.children, resource.capacityMaximum, resource.capacityMaximumChildren);
  }

  private async paid(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, currency: string): Promise<number> {
    const groups = await transaction.payment.groupBy({ by: ['currency'], where: { businessId: input.businessId, bookingId: input.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
    if (groups.some((group) => group.currency !== currency)) throw new BookingAmendmentConflictError('La moneda propuesta no coincide con los cobros registrados; no se convierte dinero.');
    const paidAmountMinor = fromPrismaMoney(groups.reduce((total, group) => total + (group._sum.amountMinor ?? 0n), 0n));
    if (paidAmountMinor < 0) throw new Error('AMENDMENT_PAYMENT_INVARIANT');
    return paidAmountMinor;
  }

  private requireExpectedPreview(preview: BookingAmendmentPreview, expected: AmendmentExpectation): void {
    if (preview.expectedUpdatedAt !== expected.expectedUpdatedAt || preview.currentPricingId !== expected.currentPricingId || preview.expectedPaidAmountMinor !== expected.expectedPaidAmountMinor) throw new BookingAmendmentConflictError('La reserva, el precio o los cobros cambiaron; actualice el preview antes de guardar.');
    if (canonicalAmendmentJson(preview.quote) !== canonicalAmendmentJson(expected.acceptedQuote)) throw new BookingAmendmentConflictError('El precio vigente no coincide con el aceptado; actualice el preview antes de guardar.');
  }

  private async warnings(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, price: { currency: string; totalAmountMinor: number }, paidAmountMinor: number): Promise<string[]> {
    const warnings = paidAmountMinor > price.totalAmountMinor ? ['La modificación conserva los cobros y deja saldo a favor; no genera reembolso.'] : [];
    const plan = await transaction.paymentPlan.findFirst({ where: { businessId: input.businessId, bookingId: input.bookingId }, select: { id: true, currency: true, totalAmountMinor: true } });
    if (!plan) return warnings;
    const [installments, applications] = await Promise.all([
      transaction.paymentPlanInstallment.aggregate({ where: { paymentPlanId: plan.id }, _sum: { amountMinor: true } }),
      transaction.paymentApplication.aggregate({ where: { installment: { paymentPlanId: plan.id } }, _sum: { amountMinor: true } }),
    ]);
    const stale = needsPaymentReconciliation(price, paidAmountMinor, {
      currency: plan.currency, totalAmountMinor: fromPrismaMoney(plan.totalAmountMinor),
      installmentTotalAmountMinor: fromPrismaMoney(installments._sum.amountMinor ?? 0n), appliedAmountMinor: fromPrismaMoney(applications._sum.amountMinor ?? 0n),
    });
    if (stale) warnings.push(PAYMENT_RECONCILIATION_WARNING);
    return warnings;
  }

  private async writeRevision(transaction: Prisma.TransactionClient, input: BookingAmendmentTransactionInput, prepared: PreparedAmendment): Promise<string> {
    const revision = await transaction.pricingRevision.create({ data: {
      businessId: input.businessId, bookingId: input.bookingId, originalSnapshotId: prepared.currentPricing.originalSnapshotId,
      revisionNumber: prepared.currentPricing.revisionNumber + 1, currency: prepared.preview.quote.currency, totalAmountMinor: toPrismaMoney(prepared.preview.quote.totalAmountMinor),
      items: prepared.preview.quote.items as unknown as Prisma.InputJsonValue,
      previousPricing: this.price(prepared.currentPricing) as unknown as Prisma.InputJsonValue,
      beforeContext: this.context(prepared.before), afterContext: this.context(prepared.after),
      paidAmountMinorAtSave: toPrismaMoney(prepared.preview.expectedPaidAmountMinor), reason: input.changes.reason, actorUserId: input.actorUserId,
    }, select: { id: true } });
    return revision.id;
  }

  private complete(booking: BookingRow): BookingContext {
    if (!booking.contactId || !booking.checkInDate || !booking.checkOutDate) throw new BookingAmendmentConflictError('La reserva requiere contacto y fechas completas.');
    return { contactId: booking.contactId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, adults: booking.adults, children: booking.children, notes: booking.notes };
  }

  private details(changes: AmendmentChanges): Partial<BookingContext> {
    const { pricing, reason, ...details } = changes;
    void pricing; void reason;
    return details;
  }

  private datesChanged(before: BookingContext, after: BookingContext): boolean { return before.checkInDate.getTime() !== after.checkInDate.getTime() || before.checkOutDate.getTime() !== after.checkOutDate.getTime(); }
  private price(price: CurrentPricing) { return { currency: price.currency, totalAmountMinor: price.totalAmountMinor, items: price.items }; }
  private context(details: BookingContext) { return { ...details, checkInDate: details.checkInDate.toISOString().slice(0, 10), checkOutDate: details.checkOutDate.toISOString().slice(0, 10) }; }
  private booking(row: BookingRow): Booking { return Booking.create({ ...row, status: row.status as BookingStatus, resourceIds: row.resources.map(({ resourceId }) => resourceId) }); }
}
