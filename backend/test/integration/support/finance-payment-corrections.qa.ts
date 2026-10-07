import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { FinanceActor, FinanceReport } from '../../../src/modules/finance/domain/finance.types';
import type { FinanceCorrectionBooking, FinanceCorrectionsData, FinancePaymentAdjustmentCommand, FinanceTerminalPricingCommand } from '../../../src/modules/finance/domain/finance-corrections.types';
import { assertFinanceDatabase, financePeriod, realFinanceToken, type FinanceFixture } from '../../fixtures/finance-fixture';

export const D2_OPENING = 1000000;
export const D2_PAID_AT = '2026-10-01T12:00:00.000Z';
export const D2_REFUND_AT = '2026-10-02T12:00:00.000Z';
export interface D2Seed { bookingId: string; paymentId: string; snapshotId: string; planId: string; accountId: string; paidMinor: number; }
type EffectivePayment = { grossRecordedAmountMinor: bigint; voidedAmountMinor: bigint; refundedAmountMinor: bigint; netRetainedAmountMinor: bigint; paymentVersion: bigint; invalidMonetaryData: boolean };
type EffectiveApplication = { originalAmountMinor: bigint; reversedAmountMinor: bigint; effectiveAmountMinor: bigint; invalidMonetaryData: boolean };
type RaceCall = () => Promise<request.Response>;

/** Only real AppModule HTTP and the verified, disposable Finance fixture database. */
export class FinancePaymentCorrectionsQa {
  constructor(readonly app: INestApplication, readonly prisma: PrismaClient, readonly fixture: FinanceFixture, readonly ownerToken: string) {}
  base(businessId = this.fixture.business.id): string { return `/api/businesses/${businessId}/finance`; }
  post(path: string, body: object, key = randomUUID(), token: string | null = this.ownerToken, businessId = this.fixture.business.id): request.Test {
    const call = request(this.app.getHttpServer()).post(`${this.base(businessId)}/${path}`).set('Idempotency-Key', key).send(body);
    return token === null ? call : call.set('Authorization', `Bearer ${token}`);
  }
  async current(seed: D2Seed): Promise<FinanceCorrectionBooking> {
    const response = await request(this.app.getHttpServer()).get(`${this.base()}/corrections`).set('Authorization', `Bearer ${this.ownerToken}`).expect(200);
    const result = (response.body as FinanceCorrectionsData).bookings.find(row => row.bookingId === seed.bookingId);
    if (!result) throw new Error('QA: missing real correction source.');
    return result;
  }
  async report(): Promise<FinanceReport> {
    const response = await request(this.app.getHttpServer()).get(this.base()).set('Authorization', `Bearer ${this.ownerToken}`).query(financePeriod).expect(200);
    return response.body as FinanceReport;
  }
  async seed(paidMinor = 1000000, status: 'CONFIRMED' | 'NO_SHOW' = 'CONFIRMED', foreign = false): Promise<D2Seed> {
    const actor = foreign ? this.fixture.foreignActor : this.fixture.actor;
    const resourceId = foreign ? this.fixture.foreignResource.id : this.fixture.resource.id;
    const token = foreign ? await realFinanceToken(this.app, actor.actorUserId) : this.ownerToken;
    const account = await this.post('commands', { type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Own D2 synthetic bank', opening: { amountMinor: D2_OPENING, occurredAt: '2026-09-01T12:00:00Z', reason: 'Explicit synthetic opening.' } }, randomUUID(), token, actor.businessId).expect(200);
    const booking = await this.prisma.booking.create({ data: { businessId: actor.businessId, status, checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'), adults: 1, children: 0, resources: { create: { resourceId } } } });
    const snapshot = await this.prisma.pricingSnapshot.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1000000, items: [{ resourceId, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 1000000, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Explicit synthetic service price.', nights: 4, breakdown: [] }] } });
    const plan = await this.prisma.paymentPlan.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1000000, createdByUserId: actor.actorUserId, updatedByUserId: actor.actorUserId } });
    const early = await this.prisma.paymentPlanInstallment.create({ data: { paymentPlanId: plan.id, amountMinor: 250000, sortOrder: 0, dueDate: new Date('2026-09-30') } });
    const late = await this.prisma.paymentPlanInstallment.create({ data: { paymentPlanId: plan.id, amountMinor: 750000, sortOrder: 1, dueDate: null } });
    const payment = await this.prisma.payment.create({ data: { businessId: actor.businessId, bookingId: booking.id, amountMinor: paidMinor, currency: 'PYG', method: 'CASH', paidAt: new Date(D2_PAID_AT), recordedByUserId: actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'd2-owned-synthetic-fixture' } });
    await this.prisma.paymentApplication.createMany({ data: [{ paymentId: payment.id, installmentId: early.id, amountMinor: 250000 }, { paymentId: payment.id, installmentId: late.id, amountMinor: paidMinor - 250000 }] });
    await this.post('commands', { type: 'LINK_PAYMENT', paymentId: payment.id, accountId: account.body.id as string, expectedVersion: 0, reason: 'Own recorded receipt, assigned once.' }, randomUUID(), token, actor.businessId).expect(200);
    return { bookingId: booking.id, paymentId: payment.id, snapshotId: snapshot.id, planId: plan.id, accountId: account.body.id as string, paidMinor };
  }
  async adjustment(seed: D2Seed, kind: 'VOID_PAYMENT' | 'REFUND_PAYMENT', amountMinor = 300000, reason = 'External correction explicitly recorded.'): Promise<FinancePaymentAdjustmentCommand> {
    const booking = await this.current(seed);
    const payment = booking.payments.find(row => row.id === seed.paymentId);
    if (!payment) throw new Error('QA: original Payment missing.');
    const scope = { type: kind, bookingId: seed.bookingId, paymentId: seed.paymentId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, expectedPaymentVersion: payment.paymentVersion, reason };
    if (kind === 'VOID_PAYMENT') return { ...scope, type: kind };
    const account = (await this.report()).accounts.find(row => row.id === seed.accountId);
    if (!account) throw new Error('QA: refund account missing.');
    return { ...scope, type: kind, amountMinor, occurredAt: D2_REFUND_AT, accountId: seed.accountId, expectedAccountVersion: account.version, reference: 'Own synthetic external refund proof.' };
  }
  async terminal(seed: D2Seed, finalAmountMinor: number, reason = 'Owner confirms the final exigible amount.'): Promise<FinanceTerminalPricingCommand> {
    const booking = await this.current(seed);
    return { type: 'SET_TERMINAL_FINAL_AMOUNT', bookingId: seed.bookingId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, finalAmountMinor, reason };
  }
  async immutable(seed: D2Seed): Promise<unknown[]> {
    return Promise.all([this.prisma.payment.findUniqueOrThrow({ where: { id: seed.paymentId } }), this.prisma.pricingSnapshot.findUniqueOrThrow({ where: { id: seed.snapshotId } }), this.prisma.paymentPlan.findUniqueOrThrow({ where: { id: seed.planId } }), this.prisma.paymentPlanInstallment.findMany({ where: { paymentPlanId: seed.planId }, orderBy: { id: 'asc' } }), this.prisma.paymentApplication.findMany({ where: { paymentId: seed.paymentId }, orderBy: { installmentId: 'asc' } })]);
  }
  async durableFacts(): Promise<unknown[]> {
    const businessId = { in: [this.fixture.business.id, this.fixture.foreignBusiness.id] };
    return Promise.all([this.prisma.booking.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.payment.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.paymentAdjustment.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.paymentApplicationReversal.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.pricingRevision.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.financeRequest.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.financeAudit.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.bookingTimelineEvent.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.financeAccount.findMany({ where: { businessId }, orderBy: { id: 'asc' } }), this.prisma.financePaymentLink.findMany({ where: { businessId }, orderBy: { id: 'asc' } })]);
  }
  async expectEffective(seed: D2Seed, expected: { voided: number; refunded: number; net: number; adjustments: number }): Promise<void> {
    const states = await this.prisma.$queryRaw<EffectivePayment[]>`SELECT * FROM "PaymentEffectiveState" WHERE "businessId"=${this.fixture.business.id} AND "paymentId"=${seed.paymentId}`;
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ grossRecordedAmountMinor: BigInt(seed.paidMinor), voidedAmountMinor: BigInt(expected.voided), refundedAmountMinor: BigInt(expected.refunded), netRetainedAmountMinor: BigInt(expected.net), paymentVersion: BigInt(1 + expected.adjustments), invalidMonetaryData: false });
    const applications = await this.prisma.$queryRaw<EffectiveApplication[]>`SELECT * FROM "PaymentApplicationEffective" WHERE "businessId"=${this.fixture.business.id} AND "paymentId"=${seed.paymentId}`;
    expect(applications).toHaveLength(2); expect(applications.every(row => !row.invalidMonetaryData)).toBe(true);
    expect(applications.reduce((sum, row) => sum + row.originalAmountMinor, 0n)).toBe(BigInt(seed.paidMinor));
    expect(applications.reduce((sum, row) => sum + row.reversedAmountMinor, 0n)).toBe(BigInt(expected.voided + expected.refunded));
    expect(applications.reduce((sum, row) => sum + row.effectiveAmountMinor, 0n)).toBe(BigInt(expected.net));
    const facts = await this.prisma.paymentAdjustment.findMany({ where: { paymentId: seed.paymentId }, orderBy: { sequence: 'asc' } });
    expect(facts).toHaveLength(expected.adjustments);
    for (const fact of facts) await this.expectOrigin(fact.id, fact.requestId, fact.kind === 'VOID' ? 'VOID_PAYMENT' : 'REFUND_PAYMENT');
    const report = await this.report();
    expect(report.accounts.find(row => row.id === seed.accountId)?.balanceMinor).toBe(D2_OPENING + expected.net);
    expect(report.totals.operatingCostMinor).toBe(0);
    expect(await this.prisma.financeExpense.count()).toBe(0); expect(await this.prisma.financeSettlement.count()).toBe(0); expect(await this.prisma.financeCashMovement.count()).toBe(0);
  }
  async expectOrigin(sourceId: string, requestId: string | null, operation: string): Promise<void> {
    const businessId = this.fixture.business.id;
    const audit = await this.prisma.financeAudit.findMany({ where: { businessId, action: operation, sourceId } });
    expect(audit).toHaveLength(1); expect(audit[0].actorUserId).toBe(this.fixture.actor.actorUserId);
    const requests = await this.prisma.financeRequest.findMany({ where: { businessId, operation, id: requestId ?? '' } });
    expect(requests).toHaveLength(1); expect(requests[0].result).toMatchObject({ id: sourceId });
  }
  async expectBooking(seed: D2Seed, total: number, net: number, debt: number, credit = 0): Promise<void> {
    const response = await request(this.app.getHttpServer()).get(`/api/businesses/${this.fixture.business.id}/bookings/${seed.bookingId}/outstanding-balance`).set('Authorization', `Bearer ${this.ownerToken}`).expect(200);
    expect(response.body).toMatchObject({ totalAmountMinor: total, paidAmountMinor: net, netRetainedAmountMinor: net, outstandingAmountMinor: debt, creditAmountMinor: credit });
    expect(await this.current(seed)).toMatchObject({ pricing: { totalAmountMinor: total }, outstandingMinor: debt, creditMinor: credit, amounts: { netRetainedAmountMinor: net } });
  }
  async race(seed: D2Seed, calls: [RaceCall, RaceCall]): Promise<request.Response[]> {
    await assertFinanceDatabase(this.prisma);
    let pending: Promise<request.Response>[] = [];
    try {
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${seed.bookingId} AND "businessId"=${this.fixture.business.id} FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        pending = calls.map(call => call());
        await waitForBlockedDescendants(this.prisma, pid);
      }, { maxWait: 5000, timeout: 10000 });
    } catch (error: unknown) { await Promise.allSettled(pending); throw error; }
    return Promise.all(pending);
  }
}

async function waitForBlockedDescendants(prisma: PrismaClient, holderPid: number): Promise<void> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: bigint }[]>`WITH RECURSIVE descendants(pid) AS (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND ${holderPid}=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN descendants d ON d.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()) SELECT count(*) AS blocked FROM descendants`;
    if (blocked >= 2n) return;
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  }
  throw new Error('QA: both independent HTTP transactions must visibly wait on the own Booking barrier.');
}

export function expectPublicConflict(response: request.Response): void {
  expect(response.status).toBe(409); expect(response.body).toMatchObject({ statusCode: 409 });
  expect(JSON.stringify(response.body)).not.toMatch(/SELECT|INSERT|UPDATE|DELETE|pg_|Prisma|deadlock|constraint|stack|requestFingerprint/i);
}

export async function financeGuardEvidence(prisma: PrismaClient): Promise<unknown[]> {
  const rows = await prisma.$queryRaw<{ writer: string; installed: boolean }[]>`SELECT writer,installed FROM "FinanceCloseGuardEvidence" ORDER BY writer`;
  expect(rows.length).toBeGreaterThanOrEqual(40); expect(rows.every(row => row.installed)).toBe(true);
  return rows;
}

/** No existing trigger is changed. The added trigger only rejects this fixture actor/business/marker. */
export async function withOwnAuditFailure(prisma: PrismaClient, actor: FinanceActor, callback: (marker: string) => Promise<void>): Promise<void> {
  await assertFinanceDatabase(prisma);
  const before = await financeGuardEvidence(prisma), suffix = randomUUID().replaceAll('-', ''), name = `finance_d2_qa_${suffix}`, marker = `d2_failure_${suffix}`;
  if (!/^[a-f0-9-]{36}$/.test(actor.businessId) || !/^[a-f0-9-]{36}$/.test(actor.actorUserId)) throw new Error('QA: audit probe requires verified fixture UUIDs.');
  await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."businessId"='${actor.businessId}' AND NEW."actorUserId"='${actor.actorUserId}' AND NEW.details->'command'->>'reason'='${marker}' THEN RAISE EXCEPTION '${marker}'; END IF; RETURN NEW; END; $$`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "FinanceAudit" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try { await callback(marker); }
    finally { await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON "FinanceAudit"`); }
  } finally { await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  expect(await financeGuardEvidence(prisma)).toEqual(before);
}
