import { PrismaClient } from '@prisma/client';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import {
  GetOutstandingBalanceUseCase,
  OutstandingBalanceInvariantError,
} from '../../src/modules/payment/application/get-outstanding-balance.use-case';
import {
  PaymentMethod,
  PaymentStatus,
  type RegisterPaymentData,
} from '../../src/modules/payment/domain/payment';
import { PrismaOutstandingBalanceRepository } from '../../src/modules/payment/infrastructure/prisma-outstanding-balance.repository';
import { PrismaPaymentPlanRepository } from '../../src/modules/payment/infrastructure/prisma-payment-plan.repository';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test')
  ? describe
  : describe.skip;

describeWithPostgres('Outstanding Balance projection with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const balances = new PrismaOutstandingBalanceRepository(prisma);
  const plans = new PrismaPaymentPlanRepository(prisma);
  const payments = new PrismaPaymentRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function fixture(
    totalAmountMinor = 100,
    status:
      | 'CONFIRMED'
      | 'IN_PROGRESS'
      | 'COMPLETED'
      | 'CANCELLED'
      | 'NO_SHOW' = 'CONFIRMED',
  ) {
    const business = await prisma.business.create({
      data: { name: `Balance ${crypto.randomUUID()}` },
    });
    const booking = await prisma.booking.create({
      data: { businessId: business.id, status },
    });
    await prisma.pricingSnapshot.create({
      data: {
        businessId: business.id,
        bookingId: booking.id,
        currency: 'PYG',
        totalAmountMinor,
        items: [],
      },
    });
    return { business, booking };
  }

  function paymentData(
    businessId: string,
    bookingId: string,
    key: string,
    amountMinor: number,
  ): RegisterPaymentData {
    return {
      businessId,
      bookingId,
      amountMinor,
      currency: 'PYG',
      method: PaymentMethod.CASH,
      reference: null,
      note: null,
      paidAt: new Date('2026-09-01T12:00:00.000Z'),
      recordedByUserId: '11111111-1111-4111-8111-111111111111',
      status: PaymentStatus.RECORDED,
      idempotencyKey: key,
      requestFingerprint: `fp:${key}:${amountMinor}`,
    };
  }

  it('aggregates recorded Payments for a Booking without a plan', async () => {
    const value = await fixture();
    await payments.register(
      paymentData(value.business.id, value.booking.id, 'partial', 40),
      100,
    );

    await expect(
      balances.calculate({
        businessId: value.business.id,
        bookingId: value.booking.id,
        businessLocalDate: '2026-09-10',
      }),
    ).resolves.toEqual({
      paymentPlanId: null,
      paidAmountMinor: 40,
      planTotalAmountMinor: null,
      installmentTotalAmountMinor: 0,
      appliedAmountMinor: 0,
      overdueAmountMinor: 0,
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
  });

  it('does not multiply aggregates across Payments, installments and applications', async () => {
    const value = await fixture();
    await plans.create({
      businessId: value.business.id,
      bookingId: value.booking.id,
      currency: 'PYG',
      totalAmountMinor: 100,
      actorUserId: 'actor',
      installments: [
        { amountMinor: 30, dueDate: new Date('2026-09-01'), sortOrder: 0 },
        { amountMinor: 30, dueDate: new Date('2026-09-05'), sortOrder: 1 },
        { amountMinor: 40, dueDate: new Date('2026-10-01'), sortOrder: 2 },
      ],
    });
    await payments.register(
      paymentData(value.business.id, value.booking.id, 'first', 20),
      100,
    );
    await payments.register(
      paymentData(value.business.id, value.booking.id, 'second', 20),
      100,
    );

    const result = await balances.calculate({
      businessId: value.business.id,
      bookingId: value.booking.id,
      businessLocalDate: '2026-09-10',
    });
    expect(result).toMatchObject({
      paidAmountMinor: 40,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
      overdueAmountMinor: 20,
      nextDueAmountMinor: 20,
    });
    expect(result.nextDueDate?.toISOString().slice(0, 10)).toBe('2026-09-05');
    await expect(
      prisma.paymentApplication.count({
        where: {
          installment: { paymentPlan: { bookingId: value.booking.id } },
        },
      }),
    ).resolves.toBe(3);
  });

  it('does not mark a null due date or the Business local date as overdue', async () => {
    const value = await fixture();
    await plans.create({
      businessId: value.business.id,
      bookingId: value.booking.id,
      currency: 'PYG',
      totalAmountMinor: 100,
      actorUserId: 'actor',
      installments: [
        { amountMinor: 40, dueDate: new Date('2026-09-10'), sortOrder: 0 },
        { amountMinor: 60, dueDate: null, sortOrder: 1 },
      ],
    });
    const result = await balances.calculate({
      businessId: value.business.id,
      bookingId: value.booking.id,
      businessLocalDate: '2026-09-10',
    });
    expect(result.overdueAmountMinor).toBe(0);
    expect(result.nextDueDate?.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(result.nextDueAmountMinor).toBe(40);
  });

  it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
    'reads historical %s Booking data for an archived Business',
    async (status) => {
      const value = await fixture(100, status);
      await prisma.business.update({
        where: { id: value.business.id },
        data: { status: 'ARCHIVED' },
      });
      await expect(
        balances.calculate({
          businessId: value.business.id,
          bookingId: value.booking.id,
          businessLocalDate: '2026-09-10',
        }),
      ).resolves.toMatchObject({ paidAmountMinor: 0 });
    },
  );

  it('keeps tenant financial aggregates isolated', async () => {
    const owner = await fixture();
    const other = await fixture();
    await payments.register(
      paymentData(owner.business.id, owner.booking.id, 'owner', 40),
      100,
    );
    await expect(
      balances.calculate({
        businessId: other.business.id,
        bookingId: owner.booking.id,
        businessLocalDate: '2026-09-10',
      }),
    ).resolves.toMatchObject({
      paymentPlanId: null,
      paidAmountMinor: 0,
      appliedAmountMinor: 0,
    });
  });

  it('surfaces an impossible persisted overpayment instead of clamping the balance', async () => {
    const value = await fixture();
    await prisma.payment.create({
      data: paymentData(value.business.id, value.booking.id, 'corrupt', 101),
    });
    const useCase = new GetOutstandingBalanceUseCase(
      balances,
      {
        findByIdAndBusinessId: () => Promise.resolve(Booking.create({
          id: value.booking.id,
          businessId: value.business.id,
          status: BookingStatus.CONFIRMED,
          contactId: null,
          resourceIds: [],
          checkInDate: null,
          checkOutDate: null,
          adults: null,
          children: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      } as never,
      {
        findByBookingId: () => Promise.resolve({
          id: 'snapshot',
          businessId: value.business.id,
          bookingId: value.booking.id,
          currency: 'PYG',
          totalAmountMinor: 100,
          items: [],
          createdAt: new Date(),
        }),
      } as never,
      {
        findById: () => Promise.resolve(Business.create({
          id: value.business.id,
          businessNumber: null,
          name: value.business.name,
          legalName: null,
          taxId: null,
          timezone: 'America/Asuncion',
          currency: 'PYG',
          status: BusinessStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      } as never,
    );
    await expect(
      useCase.execute(value.business.id, value.booking.id),
    ).rejects.toBeInstanceOf(OutstandingBalanceInvariantError);
  });

  it('returns one coherent statement snapshot during concurrent Payment registration', async () => {
    const value = await fixture();
    await plans.create({
      businessId: value.business.id,
      bookingId: value.booking.id,
      currency: 'PYG',
      totalAmountMinor: 100,
      actorUserId: 'actor',
      installments: [
        { amountMinor: 100, dueDate: new Date('2026-10-01'), sortOrder: 0 },
      ],
    });
    const [, observed] = await Promise.all([
      payments.register(
        paymentData(value.business.id, value.booking.id, 'concurrent', 40),
        100,
      ),
      balances.calculate({
        businessId: value.business.id,
        bookingId: value.booking.id,
        businessLocalDate: '2026-09-10',
      }),
    ]);
    expect([0, 40]).toContain(observed.paidAmountMinor);
    expect(observed.appliedAmountMinor).toBe(observed.paidAmountMinor);
    expect(100).toBe(
      observed.paidAmountMinor + (100 - observed.paidAmountMinor),
    );
  });
});
