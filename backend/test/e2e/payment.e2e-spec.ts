import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BOOKING_REPOSITORY } from '../../src/modules/booking/booking.contract';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { PRICING_SNAPSHOT_REPOSITORY } from '../../src/modules/pricing/pricing.contract';
import { PAYMENT_REPOSITORY, PaymentMethod, PaymentStatus, type Payment } from '../../src/modules/payment/domain/payment';

const businessId = '11111111-1111-4111-8111-111111111111'; const foreignBusinessId = '22222222-2222-4222-8222-222222222222'; const bookingId = '33333333-3333-4333-8333-333333333333'; const foreignBookingId = '44444444-4444-4444-8444-444444444444'; const actorId = '55555555-5555-4555-8555-555555555555';
const business = (id: string, status = BusinessStatus.ACTIVE) => Business.create({ id, businessNumber: null, name: id, legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const booking = (id: string, owner: string, status = BookingStatus.CONFIRMED) => Booking.create({ id, businessId: owner, status, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });

describe('Register payment API', () => {
  let app: INestApplication; let businesses: Business[]; let bookings: Booking[]; let payments: Payment[];
  const snapshots = new Map<string, { id: string; businessId: string; bookingId: string; currency: string; totalAmountMinor: number; items: []; createdAt: Date }>();
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: (id: string) => Promise.resolve(businesses.find((item) => item.id === id) ?? null), create: jest.fn(), list: jest.fn(), update: jest.fn() })
    .overrideProvider(BOOKING_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(bookings.find((item) => item.id === id && item.businessId === owner) ?? null), create: jest.fn(), listByBusinessId: jest.fn(), update: jest.fn(), markPending: jest.fn(), markCancelled: jest.fn(), hasBlockingBooking: jest.fn(), listBlockingBookings: jest.fn() })
    .overrideProvider(PRICING_SNAPSHOT_REPOSITORY).useValue({ findByBookingId: (id: string) => Promise.resolve(snapshots.get(id) ?? null), create: jest.fn() })
    .overrideProvider(PAYMENT_REPOSITORY).useValue({ register: async (data: Omit<Payment, 'id' | 'createdAt'>, total: number) => { const prior = payments.find((item) => item.businessId === data.businessId && item.idempotencyKey === data.idempotencyKey); if (prior) { if (prior.requestFingerprint !== data.requestFingerprint) throw new Error('IDEMPOTENCY_CONFLICT'); return { payment: prior, duplicate: true }; } const paid = payments.filter((item) => item.bookingId === data.bookingId).reduce((sum, item) => sum + item.amountMinor, 0); if (paid + data.amountMinor > total) throw new Error('OVERPAYMENT'); const created: Payment = { id: `payment-${payments.length + 1}`, ...data, createdAt: new Date() }; payments.push(created); return { payment: created, duplicate: false }; } })
    .compile(); app = module.createNestApplication(); app.use((req: { authenticatedPrincipal?: { userId: string } }, _res, next) => { req.authenticatedPrincipal = { userId: actorId }; next(); }); configureApplication(app, { security: false }); await app.init(); });
  afterAll(async () => app.close());
  beforeEach(() => { businesses = [business(businessId), business(foreignBusinessId)]; bookings = [booking(bookingId, businessId), booking(foreignBookingId, foreignBusinessId)]; payments = []; snapshots.clear(); snapshots.set(bookingId, { id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() }); });
  const endpoint = (owner = businessId, id = bookingId) => `/api/businesses/${owner}/bookings/${id}/payments`; const payload = (amountMinor = 40) => ({ amountMinor, method: 'CASH', paidAt: '2026-09-01T12:00:00.000Z', reference: ' Ref ', note: ' Nota ' });

  it('creates a scoped payment with derived currency and actor without changing booking or snapshot', async () => { const before = bookings[0]; const snapshot = snapshots.get(bookingId); const response = await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'create-key').send({ ...payload(), currency: 'USD', recordedByUserId: 'attacker' }).expect(201); expect(response.body).toMatchObject({ bookingId, amountMinor: 40, currency: 'PYG', method: PaymentMethod.CASH, reference: 'Ref', note: 'Nota', recordedByUserId: actorId, status: PaymentStatus.RECORDED }); expect(response.body).not.toHaveProperty('props'); expect(bookings[0]).toBe(before); expect(snapshots.get(bookingId)).toBe(snapshot); expect(payments).toHaveLength(1); });
  it('returns 400 for invalid amount and a missing idempotency key', async () => { await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'invalid').send(payload(0)).expect(400); await request(app.getHttpServer()).post(endpoint()).send(payload()).expect(400); });
  it('hides nonexistent and cross-tenant bookings with 404', async () => { await request(app.getHttpServer()).post(endpoint(businessId, '66666666-6666-4666-8666-666666666666')).set('Idempotency-Key', 'missing').send(payload()).expect(404); await request(app.getHttpServer()).post(endpoint(foreignBusinessId, bookingId)).set('Idempotency-Key', 'foreign').send(payload()).expect(404); });
  it('returns 409 for overpayment, idempotency mismatch and archived business', async () => { await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'first').send(payload(60)).expect(201); await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'next').send(payload(50)).expect(409); await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'first').send(payload(50)).expect(409); businesses = [business(businessId, BusinessStatus.ARCHIVED), business(foreignBusinessId)]; await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'archived').send(payload()).expect(409); });
  it('retries an identical request idempotently and persists only one payment', async () => { const first = await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'retry').send(payload()).expect(201); const second = await request(app.getHttpServer()).post(endpoint()).set('Idempotency-Key', 'retry').send(payload()).expect(201); expect(second.body.id).toBe(first.body.id); expect(payments).toHaveLength(1); });
});
