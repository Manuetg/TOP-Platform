import { PrismaPricingSnapshotRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing-snapshot.repository';
import { PaymentPlanUseCases } from '../../src/modules/payment/application/payment-plan.use-cases';
import { RegisterPaymentUseCase } from '../../src/modules/payment/application/register-payment.use-case';
import { GetOutstandingBalanceUseCase } from '../../src/modules/payment/application/get-outstanding-balance.use-case';
import { PrismaPaymentPlanRepository } from '../../src/modules/payment/infrastructure/prisma-payment-plan.repository';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { PrismaOutstandingBalanceRepository } from '../../src/modules/payment/infrastructure/prisma-outstanding-balance.repository';
import { PrismaRevenueProjectionReader } from '../../src/modules/payment/infrastructure/prisma-revenue-projection.reader';
import { PrepareManualPriceUseCase, ManualPriceRatePlanAvailableError } from '../../src/modules/pricing/application/prepare-manual-price.use-case';
import { ListRatePlansUseCase } from '../../src/modules/pricing/application/list-rate-plans.use-case';
import { PrismaClient } from '@prisma/client';
import { ConfirmBookingUseCase } from '../../src/modules/booking-lifecycle/application/confirm-booking.use-case';
import { PrismaBookingConfirmationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-confirmation.transaction';
import { BookingAvailabilityConflictError, BookingNotFoundError, BookingStatus } from '../../src/modules/booking/booking.contract';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { PrismaBlockRepository } from '../../src/modules/block/infrastructure/prisma-block.repository';
import { PrismaAvailabilityRulesRepository } from '../../src/modules/availability/infrastructure/prisma-availability-rules.repository';
import { CheckAvailabilityUseCase } from '../../src/modules/availability/application/check-availability.use-case';
import { ValidateOverbookingUseCase } from '../../src/modules/availability/application/validate-overbooking.use-case';
import { PrismaRatePlanRepository } from '../../src/modules/pricing/infrastructure/prisma-rate-plan.repository';
import { PrismaSeasonalRateRepository } from '../../src/modules/pricing/infrastructure/prisma-seasonal-rate.repository';
import { CalculatePriceUseCase } from '../../src/modules/pricing/application/calculate-price.use-case';
import { ApplyManualPriceOverrideUseCase } from '../../src/modules/pricing/application/apply-manual-price-override.use-case';
import { PricingCalculator } from '../../src/modules/pricing/domain/pricing-calculator';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('ConfirmBookingUseCase', () => {
  const prisma = new PrismaClient(); const businesses = new PrismaBusinessRepository(prisma); const contacts = new PrismaContactRepository(prisma); const resources = new PrismaResourceRepository(prisma); const bookings = new PrismaBookingRepository(prisma); const blocks = new PrismaBlockRepository(prisma); const rules = new PrismaAvailabilityRulesRepository(prisma); const rates = new PrismaRatePlanRepository(prisma); const seasons = new PrismaSeasonalRateRepository(prisma);
  const availability = new ValidateOverbookingUseCase(new CheckAvailabilityUseCase(businesses, resources, bookings, blocks, rules));
  const calculate = new CalculatePriceUseCase(businesses, resources, rates, rates, seasons, new PricingCalculator());
  const confirm = new ConfirmBookingUseCase(businesses, contacts, bookings, availability, calculate, new ApplyManualPriceOverrideUseCase(calculate), new PrismaBookingConfirmationTransaction(prisma), new PrepareManualPriceUseCase(new ListRatePlansUseCase(businesses, resources, rates), businesses));
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function fixture(name: string) { const business = await prisma.business.create({ data: { name } }); const contact = await prisma.contact.create({ data: { businessId: business.id, name: 'Guest', email: `${name.replaceAll(' ', '')}@test.local` } }); const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Room', internalCode: `${name.replaceAll(' ', '').toUpperCase()}R`, capacityMaximum: 2 } }); const ratePlan = await prisma.ratePlan.create({ data: { businessId: business.id, name: 'Base', baseNightlyAmountMinor: 150000, resources: { create: { resourceId: resource.id } } } }); const booking = await bookings.create({ businessId: business.id, contactId: contact.id, resourceIds: [resource.id], checkInDate: new Date('2026-06-10'), checkOutDate: new Date('2026-06-12'), adults: null, children: null, notes: null }); await bookings.markPending(booking.id, business.id, null); return { business, resource, ratePlan, booking }; }
  const pricing = (value: { resource: { id: string }; ratePlan: { id: string } }) => [{ resourceId: value.resource.id, ratePlanId: value.ratePlan.id }];
  it('confirms a pending booking, excludes itself, and persists calculated snapshot', async () => { const value = await fixture('Calculated'); await expect(confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: pricing(value) })).resolves.toMatchObject({ status: BookingStatus.CONFIRMED }); await expect(prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).resolves.toMatchObject({ currency: 'PYG', totalAmountMinor: 300000n }); });
  it('persists manual override pricing in the immutable snapshot', async () => { const value = await fixture('Manual'); await confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: [{ ...pricing(value)[0], agreedAmountMinor: 250000, overrideReason: 'Commercial discount' }] }); await expect(prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).resolves.toMatchObject({ totalAmountMinor: 250000n, items: expect.arrayContaining([expect.objectContaining({ pricingMode: 'MANUAL_OVERRIDE', agreedAmountMinor: 250000 })]) }); });
  it('rolls back when another pending booking intersects the same resource', async () => { const value = await fixture('Conflict'); const other = await bookings.create({ businessId: value.business.id, contactId: (await prisma.contact.findFirst({ where: { businessId: value.business.id } }))!.id, resourceIds: [value.resource.id], checkInDate: new Date('2026-06-11'), checkOutDate: new Date('2026-06-13'), adults: null, children: null, notes: null }); await bookings.markPending(other.id, value.business.id, null); await expect(confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: pricing(value) })).rejects.toBeInstanceOf(BookingAvailabilityConflictError); await expect(prisma.booking.findUnique({ where: { id: value.booking.id } })).resolves.toMatchObject({ status: BookingStatus.PENDING }); await expect(prisma.pricingSnapshot.count({ where: { bookingId: value.booking.id } })).resolves.toBe(0); });
  it('rolls back status and snapshot when pricing fails', async () => { const value = await fixture('Pricing failure'); await expect(confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: [{ resourceId: value.resource.id, ratePlanId: '11111111-1111-4111-8111-111111111111' }] })).rejects.toThrow(); await expect(prisma.booking.findUnique({ where: { id: value.booking.id } })).resolves.toMatchObject({ status: BookingStatus.PENDING }); await expect(prisma.pricingSnapshot.count({ where: { bookingId: value.booking.id } })).resolves.toBe(0); });
  it('hides a pending booking from another tenant', async () => { const owner = await fixture('Owner'); const other = await fixture('Other'); await expect(confirm.execute({ businessId: other.business.id, bookingId: owner.booking.id, pricing: pricing(owner) })).rejects.toBeInstanceOf(BookingNotFoundError); });
  it('allows exactly one concurrent confirmation for conflicting pending bookings', async () => { const value = await fixture('Race'); await prisma.availabilityRule.create({ data: { businessId: value.business.id, pendingBlocksAvailability: false, bufferBeforeDays: 0, bufferAfterDays: 0 } }); const second = await bookings.create({ businessId: value.business.id, contactId: (await prisma.contact.findFirst({ where: { businessId: value.business.id } }))!.id, resourceIds: [value.resource.id], checkInDate: new Date('2026-06-10'), checkOutDate: new Date('2026-06-12'), adults: null, children: null, notes: null }); await bookings.markPending(second.id, value.business.id, null); const outcomes = await Promise.allSettled([confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: pricing(value) }), confirm.execute({ businessId: value.business.id, bookingId: second.id, pricing: pricing(value) })]); expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1); await expect(prisma.booking.count({ where: { id: { in: [value.booking.id, second.id] }, status: BookingStatus.CONFIRMED } })).resolves.toBe(1); await expect(prisma.pricingSnapshot.count({ where: { bookingId: { in: [value.booking.id, second.id] } } })).resolves.toBe(1); });
  it('persiste sin plan, conserva el histórico tras configurar tarifa y audita al actor', async () => {
    const value = await fixture('Sin tarifa');
    await prisma.ratePlan.update({ where: { id: value.ratePlan.id }, data: { status: 'ARCHIVED' } });
    const actor = await prisma.user.create({ data: { email: 'manual@test.local' } });
    await confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, actorUserId: actor.id, pricing: [{ resourceId: value.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 123456, overrideReason: '  Acuerdo directo  ' }] });
    const snapshot = await prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: value.booking.id } });
    expect(snapshot).toMatchObject({ currency: 'PYG', totalAmountMinor: 123456n, items: [{ resourceId: value.resource.id, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, adjustmentAmountMinor: null, agreedAmountMinor: 123456, overrideReason: 'Acuerdo directo', nights: 2, breakdown: [] }] });
    expect(await prisma.bookingTimelineEvent.findFirst({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toMatchObject({ actorUserId: actor.id });
    await prisma.ratePlan.update({ where: { id: value.ratePlan.id }, data: { status: 'ACTIVE' } });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(snapshot);
    const snapshots = new PrismaPricingSnapshotRepository(prisma);
    const paymentPlans = new PaymentPlanUseCases(new PrismaPaymentPlanRepository(prisma), bookings, snapshots, businesses);
    await expect(paymentPlans.create({ businessId: value.business.id, bookingId: value.booking.id, actorUserId: actor.id, installments: [{ amountMinor: 123456 }] })).resolves.toMatchObject({ totalAmountMinor: 123456, currency: 'PYG' });
    const register = new RegisterPaymentUseCase(new PrismaPaymentRepository(prisma), bookings, snapshots, businesses);
    await register.execute({ businessId: value.business.id, bookingId: value.booking.id, actorUserId: actor.id, amountMinor: 50000, method: 'CASH', paidAt: '2026-01-01T12:00:00Z', idempotencyKey: 'manual-price-payment' });
    const balances = new GetOutstandingBalanceUseCase(new PrismaOutstandingBalanceRepository(prisma), bookings, snapshots, businesses);
    await expect(balances.execute(value.business.id, value.booking.id)).resolves.toMatchObject({ totalAmountMinor: 123456, paidAmountMinor: 50000, outstandingAmountMinor: 73456 });
    await expect(new PrismaRevenueProjectionReader(prisma).read({ businessId: value.business.id, from: '2026-01-01', to: '2026-01-02', timeZone: 'America/Asuncion' })).resolves.toEqual({ amounts: [{ currency: 'PYG', amountMinor: 50000 }] });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(snapshot);
  });
  it('consulta planes nuevamente y revierte confirmación, Snapshot y Timeline cuando aparece uno', async () => {
    const value = await fixture('Nuevo plan');
    await prisma.ratePlan.update({ where: { id: value.ratePlan.id }, data: { status: 'ARCHIVED' } });
    const selection = new ListRatePlansUseCase(businesses, resources, rates);
    expect(await selection.execute({ businessId: value.business.id, resourceId: value.resource.id, checkIn: '2026-06-10', checkOut: '2026-06-12' })).toEqual([]);
    await prisma.ratePlan.update({ where: { id: value.ratePlan.id }, data: { status: 'ACTIVE' } });
    await expect(confirm.execute({ businessId: value.business.id, bookingId: value.booking.id, pricing: [{ resourceId: value.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 100000, overrideReason: 'Acuerdo directo' }] })).rejects.toBeInstanceOf(ManualPriceRatePlanAvailableError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: BookingStatus.PENDING });
    expect(await prisma.pricingSnapshot.count({ where: { bookingId: value.booking.id } })).toBe(0);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(0);
  });

});
