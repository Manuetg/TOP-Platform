import { PrismaClient } from '@prisma/client';
import { PaymentMethod, PaymentStatus, type RegisterPaymentData } from '../../src/modules/payment/domain/payment';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('PrismaPaymentRepository with PostgreSQL', () => {
  const prisma = new PrismaClient(); const repository = new PrismaPaymentRepository(prisma);
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => prisma.$disconnect());
  async function fixture(total = 100) { const business = await prisma.business.create({ data: { name: `Payments ${crypto.randomUUID()}` } }); const booking = await prisma.booking.create({ data: { businessId: business.id, status: 'CONFIRMED' } }); await prisma.pricingSnapshot.create({ data: { businessId: business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: total, items: [] } }); return { business, booking }; }
  const data = (businessId: string, bookingId: string, key: string, amountMinor = 40): RegisterPaymentData => ({ businessId, bookingId, amountMinor, currency: 'PYG', method: PaymentMethod.CASH, reference: null, note: null, paidAt: new Date('2026-09-01T12:00:00Z'), recordedByUserId: '11111111-1111-4111-8111-111111111111', status: PaymentStatus.RECORDED, idempotencyKey: key, requestFingerprint: `fp:${key}:${amountMinor}` });

  it('persists the payment record and isolates tenant idempotency keys', async () => { const first = await fixture(); const second = await fixture(); const created = await repository.register(data(first.business.id, first.booking.id, 'same-key'), 100); await repository.register(data(second.business.id, second.booking.id, 'same-key'), 100); await expect(prisma.payment.findUnique({ where: { id: created.payment.id } })).resolves.toMatchObject({ businessId: first.business.id, bookingId: first.booking.id, amountMinor: 40, currency: 'PYG', method: 'CASH', recordedByUserId: '11111111-1111-4111-8111-111111111111', status: 'RECORDED', idempotencyKey: 'same-key', requestFingerprint: 'fp:same-key:40' }); await expect(prisma.payment.count({ where: { businessId: second.business.id, idempotencyKey: 'same-key' } })).resolves.toBe(1); });
  it('does not expose a payment under another Business query', async () => { const owner = await fixture(); const other = await fixture(); const created = await repository.register(data(owner.business.id, owner.booking.id, 'owner-key'), 100); await expect(prisma.payment.findFirst({ where: { id: created.payment.id, businessId: other.business.id } })).resolves.toBeNull(); });
  it('allows only one concurrent payment when two requests would exceed the snapshot total', async () => { const value = await fixture(100); const attempts = await Promise.allSettled([repository.register(data(value.business.id, value.booking.id, 'a', 70), 100), repository.register(data(value.business.id, value.booking.id, 'b', 70), 100)]); expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1); await expect(prisma.payment.aggregate({ where: { bookingId: value.booking.id, status: 'RECORDED' }, _sum: { amountMinor: true } })).resolves.toEqual({ _sum: { amountMinor: 70 } }); });
});
