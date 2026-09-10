import { PrismaClient } from '@prisma/client';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('PrismaPaymentRepository payment history with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaPaymentRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function fixture(status: 'DRAFT'|'PENDING'|'CONFIRMED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'|'NO_SHOW' = 'CONFIRMED') {
    const business = await prisma.business.create({ data: { name: `History ${crypto.randomUUID()}` } });
    const booking = await prisma.booking.create({ data: { businessId: business.id, status } });
    return { business, booking };
  }

  async function addPayment(input: {
    businessId:string;
    bookingId:string;
    id:string;
    paidAt:string;
    createdAt:string;
    amountMinor?:number;
  }) {
    return prisma.payment.create({ data: {
      id: input.id,
      businessId: input.businessId,
      bookingId: input.bookingId,
      amountMinor: input.amountMinor ?? 10,
      currency: 'PYG',
      method: 'CASH',
      reference: `ref-${input.id.slice(-1)}`,
      note: null,
      paidAt: new Date(input.paidAt),
      createdAt: new Date(input.createdAt),
      recordedByUserId: '11111111-1111-4111-8111-111111111111',
      status: 'RECORDED',
      idempotencyKey: `key-${input.id}`,
      requestFingerprint: `fingerprint-${input.id}`,
    } });
  }

  it('returns an empty history for a valid Booking without PricingSnapshot', async () => {
    const value = await fixture('DRAFT');
    await expect(repository.listByBooking({ businessId: value.business.id, bookingId: value.booking.id, before: null, limit: 51 })).resolves.toEqual([]);
  });

  it('orders by paidAt, createdAt and id descending while selecting only public fields', async () => {
    const value = await fixture();
    const base = { businessId: value.business.id, bookingId: value.booking.id };
    await addPayment({ ...base, id: '10000000-0000-4000-8000-000000000001', paidAt: '2026-09-08T10:00:00.000Z', createdAt: '2026-09-09T10:00:00.000Z' });
    await addPayment({ ...base, id: '10000000-0000-4000-8000-000000000002', paidAt: '2026-09-09T10:00:00.000Z', createdAt: '2026-09-09T10:00:00.000Z' });
    await addPayment({ ...base, id: '10000000-0000-4000-8000-000000000003', paidAt: '2026-09-09T10:00:00.000Z', createdAt: '2026-09-09T10:00:00.000Z' });
    await addPayment({ ...base, id: '10000000-0000-4000-8000-000000000004', paidAt: '2026-09-09T10:00:00.000Z', createdAt: '2026-09-09T11:00:00.000Z' });
    const rows = await repository.listByBooking({ ...base, before: null, limit: 10 });
    expect(rows.map((item) => item.id)).toEqual([
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'amountMinor', 'bookingId', 'createdAt', 'currency', 'id', 'method', 'note',
      'paidAt', 'recordedByUserId', 'reference', 'status',
    ]);
  });

  it('paginates a composite cursor without duplicates and keeps tenant scope', async () => {
    const owner = await fixture();
    const other = await fixture();
    const paidAt = '2026-09-09T10:00:00.000Z';
    const createdAt = '2026-09-09T11:00:00.000Z';
    for (const suffix of ['001', '002', '003', '004']) {
      await addPayment({ businessId: owner.business.id, bookingId: owner.booking.id, id: `20000000-0000-4000-8000-000000000${suffix}`, paidAt, createdAt });
    }
    await addPayment({ businessId: other.business.id, bookingId: other.booking.id, id: '20000000-0000-4000-8000-999999999999', paidAt, createdAt });
    const first = await repository.listByBooking({ businessId: owner.business.id, bookingId: owner.booking.id, before: null, limit: 2 });
    const cursor = first.at(-1)!;
    const second = await repository.listByBooking({ businessId: owner.business.id, bookingId: owner.booking.id, before: { paidAt: cursor.paidAt, createdAt: cursor.createdAt, id: cursor.id }, limit: 2 });
    expect([...first, ...second].map((item) => item.id)).toEqual([
      '20000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
    ]);
    expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(4);
  });

  it('does not inject a newer concurrent Payment into the next page', async () => {
    const value = await fixture('COMPLETED');
    const base = { businessId: value.business.id, bookingId: value.booking.id };
    await addPayment({ ...base, id: '30000000-0000-4000-8000-000000000001', paidAt: '2026-09-01T10:00:00.000Z', createdAt: '2026-09-01T11:00:00.000Z' });
    await addPayment({ ...base, id: '30000000-0000-4000-8000-000000000002', paidAt: '2026-09-02T10:00:00.000Z', createdAt: '2026-09-02T11:00:00.000Z' });
    await addPayment({ ...base, id: '30000000-0000-4000-8000-000000000003', paidAt: '2026-09-03T10:00:00.000Z', createdAt: '2026-09-03T11:00:00.000Z' });
    const first = await repository.listByBooking({ ...base, before: null, limit: 2 });
    const cursor = first.at(-1)!;
    await addPayment({ ...base, id: '30000000-0000-4000-8000-000000000004', paidAt: '2026-09-04T10:00:00.000Z', createdAt: '2026-09-04T11:00:00.000Z' });
    const second = await repository.listByBooking({ ...base, before: { paidAt: cursor.paidAt, createdAt: cursor.createdAt, id: cursor.id }, limit: 2 });
    expect(first.map((item) => item.id)).toEqual(['30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002']);
    expect(second.map((item) => item.id)).toEqual(['30000000-0000-4000-8000-000000000001']);
  });

  it('reads historical Payments from an archived Business and historical Booking', async () => {
    const value = await fixture('NO_SHOW');
    await prisma.business.update({ where: { id: value.business.id }, data: { status: 'ARCHIVED' } });
    await addPayment({ businessId: value.business.id, bookingId: value.booking.id, id: '40000000-0000-4000-8000-000000000001', paidAt: '2020-01-01T10:00:00.000Z', createdAt: '2026-09-09T11:00:00.000Z' });
    const rows = await repository.listByBooking({ businessId: value.business.id, bookingId: value.booking.id, before: null, limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0].paidAt).toEqual(new Date('2020-01-01T10:00:00.000Z'));
  });
});
