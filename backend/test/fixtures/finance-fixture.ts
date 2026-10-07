import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type MembershipRole } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { PrismaService } from '../../src/modules/business/business.contract';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import type { FinanceActor, FinanceCommand, FinanceMutation } from '../../src/modules/finance/domain/finance.types';
import { cleanTestDatabase } from '../integration/support/clean-test-database';

export const financePeriod = { from: '2026-09-01', to: '2026-11-01' };
export const financeInstant = '2026-10-01T12:00:00.000Z';

export async function assertFinanceDatabase(prisma: PrismaClient): Promise<void> {
  const configured = process.env.DATABASE_URL;
  if (!configured || configured !== process.env.TEST_DATABASE_URL) {
    throw new Error('Finance QA requiere DATABASE_URL y TEST_DATABASE_URL iguales y explícitas.');
  }
  const url = new URL(configured);
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(url.hostname) || !/^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(url.pathname)) {
    throw new Error('Finance QA solo admite PostgreSQL sintético de test en host local o postgres de CI.');
  }
  const expectedOwner = process.env.TEST_DATABASE_OWNER;
  if (!expectedOwner || expectedOwner !== decodeURIComponent(url.username)) {
    throw new Error('Finance QA requiere TEST_DATABASE_OWNER explícito e igual al actor configurado.');
  }
  const identity = await prisma.$queryRaw<{ database: string; owner: string }[]>`SELECT current_database() AS database, current_user AS owner`;
  if (identity.length !== 1 || identity[0].database !== decodeURIComponent(url.pathname.slice(1)) || identity[0].owner !== expectedOwner) {
    throw new Error('La identidad y el actor PostgreSQL no coinciden con el entorno sintético autorizado.');
  }
}

export async function resetFinanceDatabase(prisma: PrismaClient): Promise<void> {
  await assertFinanceDatabase(prisma);
  await cleanTestDatabase(prisma, process.env.DATABASE_URL);
}

export async function createFinanceApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    configureApplication(app);
    await app.init();
    await assertFinanceDatabase(app.get(PrismaService));
    return app;
  } catch (error: unknown) {
    await closeFinanceApp(app);
    throw error;
  }
}

export async function closeFinanceApp(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  try { await app.close(); }
  finally { await prisma.$disconnect(); }
}

export async function financeFixture(prisma: PrismaClient) {
  const business = await prisma.business.create({ data: { name: `Finance QA ${randomUUID()}`, timezone: 'America/Asuncion', currency: 'PYG' } });
  const foreignBusiness = await prisma.business.create({ data: { name: `Finance foreign ${randomUUID()}`, timezone: 'America/Asuncion', currency: 'PYG' } });
  const roles: MembershipRole[] = ['OWNER', 'ADMIN', 'RECEPTIONIST', 'VIEWER'];
  const users = {} as Record<MembershipRole, { id: string }>;
  for (const role of roles) {
    const user = await prisma.user.create({ data: { email: `finance-${role}-${randomUUID()}@top.test`, emailVerifiedAt: new Date('2026-01-01') } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role } });
    users[role] = { id: user.id };
  }
  const foreignOwner = await prisma.user.create({ data: { email: `finance-foreign-${randomUUID()}@top.test`, emailVerifiedAt: new Date('2026-01-01') } });
  await prisma.userBusinessMembership.create({ data: { userId: foreignOwner.id, businessId: foreignBusiness.id, role: 'OWNER' } });
  const category = await prisma.financeCatalog.create({ data: { businessId: business.id, kind: 'CATEGORY', name: 'Reparaciones' } });
  const counterparty = await prisma.financeCatalog.create({ data: { businessId: business.id, kind: 'COUNTERPARTY', name: 'Proveedor sintético' } });
  const foreignCategory = await prisma.financeCatalog.create({ data: { businessId: foreignBusiness.id, kind: 'CATEGORY', name: 'Categoría ajena' } });
  const foreignCounterparty = await prisma.financeCatalog.create({ data: { businessId: foreignBusiness.id, kind: 'COUNTERPARTY', name: 'Proveedor ajeno' } });
  const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña QA', internalCode: 'QA1', capacityMaximum: 2 } });
  const foreignResource = await prisma.resource.create({ data: { businessId: foreignBusiness.id, name: 'Cabaña ajena', internalCode: 'QA2', capacityMaximum: 2 } });
  const actor: FinanceActor = { businessId: business.id, actorUserId: users.OWNER.id };
  const foreignActor: FinanceActor = { businessId: foreignBusiness.id, actorUserId: foreignOwner.id };
  return { business, foreignBusiness, users, foreignOwner, category, counterparty, foreignCategory, foreignCounterparty, resource, foreignResource, actor, foreignActor };
}

export type FinanceFixture = Awaited<ReturnType<typeof financeFixture>>;

export function expenseCommand(fixture: FinanceFixture, amountMinor = 900000): Extract<FinanceCommand, { type: 'CREATE_EXPENSE' }> {
  return {
    type: 'CREATE_EXPENSE', description: 'Reparación sintética', consumedOn: '2026-09-30', dueOn: '2026-10-10',
    counterpartyId: fixture.counterparty.id, reference: null, amountMinor,
    lines: [{ label: 'Reparación', categoryId: fixture.category.id, resourceId: fixture.resource.id, amountMinor, operational: true }],
    settlement: null,
  };
}

export function financeMutation(actor: FinanceActor, command: FinanceCommand, key: string = randomUUID()): FinanceMutation {
  return { ...actor, command, idempotencyKey: key, fingerprint: createHash('sha256').update(JSON.stringify(command)).digest('hex') };
}

export async function realFinanceToken(app: INestApplication, userId: string): Promise<string> {
  return (await app.get(JwtAccessTokenIssuer).issue({ sub: userId })).token;
}

export async function financePaymentFixture(prisma: PrismaClient, actor: FinanceActor, amountMinor = 400000, paidAt = financeInstant, currency = 'PYG') {
  const booking = await prisma.booking.create({ data: { businessId: actor.businessId, status: 'CONFIRMED' } });
  const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1000000, items: [] } });
  const plan = await prisma.paymentPlan.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1000000, createdByUserId: actor.actorUserId, updatedByUserId: actor.actorUserId } });
  const installment = await prisma.paymentPlanInstallment.create({ data: { paymentPlanId: plan.id, amountMinor: 1000000, sortOrder: 1 } });
  const payment = await prisma.payment.create({ data: { businessId: actor.businessId, bookingId: booking.id, amountMinor, currency, method: 'CASH', paidAt: new Date(paidAt), recordedByUserId: actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'synthetic-payment-fixture' } });
  await prisma.paymentApplication.create({ data: { paymentId: payment.id, installmentId: installment.id, amountMinor } });
  return { booking, snapshot, plan, installment, payment };
}

export async function paymentFingerprint(prisma: PrismaClient, bookingId: string): Promise<string> {
  const rows = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId } }),
    prisma.pricingSnapshot.findMany({ where: { bookingId }, orderBy: { id: 'asc' } }),
    prisma.pricingRevision.findMany({ where: { bookingId }, orderBy: { id: 'asc' } }),
    prisma.payment.findMany({ where: { bookingId }, orderBy: { id: 'asc' } }),
    prisma.paymentPlan.findMany({ where: { bookingId }, include: { installments: { include: { applications: true }, orderBy: { id: 'asc' } } } }),
  ]);
  return createHash('sha256').update(JSON.stringify(rows, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
}
