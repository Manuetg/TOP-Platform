import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import { FinanceCorrectionsUseCases } from '../../src/modules/finance/application/finance-corrections.use-cases';
import { closeFinanceApp, createFinanceApp, financeFixture, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';
import { D2_OPENING, D2_REFUND_AT, expectPublicConflict, financeGuardEvidence, FinancePaymentCorrectionsQa, withOwnAuditFailure } from './support/finance-payment-corrections.qa';

// No mocks, overrides or skipped suites. Root must run against its own guarded PostgreSQL resources.
describe('FIN017/018 D2: real AppModule, authenticated HTTP, canonical PostgreSQL facts and queued writers', () => {
  let app: INestApplication, prisma: PrismaService, fixture: FinanceFixture, qa: FinancePaymentCorrectionsQa;
  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); qa = new FinancePaymentCorrectionsQa(app, prisma, fixture, await realFinanceToken(app, fixture.users.OWNER.id)); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  it('Golden K: original1M, manual final800k and refund200k leave net800k/credit0/cash1.8M without cost or rewritten history', async () => {
    const seed = await qa.seed(1000000, 'NO_SHOW'), original = await qa.immutable(seed);
    const final = await qa.post('terminal-pricing', await qa.terminal(seed, 800000)).expect(200);
    await qa.expectBooking(seed, 800000, 1000000, 0, 200000);
    const body = await qa.adjustment(seed, 'REFUND_PAYMENT', 200000), key = randomUUID();
    const refund = await qa.post('payment-adjustments', body, key).expect(200);
    expect((await qa.post('payment-adjustments', body, key).expect(200)).body).toEqual(refund.body);
    await qa.expectEffective(seed, { voided: 0, refunded: 200000, net: 800000, adjustments: 1 });
    await qa.expectBooking(seed, 800000, 800000, 0); expect(await qa.immutable(seed)).toEqual(original);
    const revision = await prisma.pricingRevision.findUniqueOrThrow({ where: { id: final.body.id as string } });
    expect(revision).toMatchObject({ kind: 'TERMINAL_FINAL_AMOUNT', totalAmountMinor: 800000n, paidAmountMinorAtSave: 1000000n, originalSnapshotId: seed.snapshotId });
    await qa.expectOrigin(revision.id, revision.requestId, 'SET_TERMINAL_FINAL_AMOUNT');
    expect(await prisma.financeTerminalRecognition.count()).toBe(0); expect((await prisma.booking.findUniqueOrThrow({ where: { id: seed.bookingId } })).status).toBe('NO_SHOW');
  });

  it('Golden F: deposit400k, manual final100k and refund300k leave debt0/net100k with no automatic penalty or second expense', async () => {
    const seed = await qa.seed(400000, 'NO_SHOW'), original = await qa.immutable(seed);
    await qa.expectBooking(seed, 1000000, 400000, 600000);
    await qa.post('terminal-pricing', await qa.terminal(seed, 100000)).expect(200);
    await qa.expectBooking(seed, 100000, 400000, 0, 300000);
    await qa.post('payment-adjustments', await qa.adjustment(seed, 'REFUND_PAYMENT', 300000)).expect(200);
    await qa.expectEffective(seed, { voided: 0, refunded: 300000, net: 100000, adjustments: 1 });
    await qa.expectBooking(seed, 100000, 100000, 0); expect(await qa.immutable(seed)).toEqual(original);
    expect(await prisma.pricingRevision.count()).toBe(1); expect(await prisma.financeTerminalRecognition.count()).toBe(0);
  });

  it('refund without a commercial reduction reopens debt200k and effective applications while preserving the original demand1M', async () => {
    const seed = await qa.seed(), original = await qa.immutable(seed);
    await qa.post('payment-adjustments', await qa.adjustment(seed, 'REFUND_PAYMENT', 200000)).expect(200);
    await qa.expectEffective(seed, { voided: 0, refunded: 200000, net: 800000, adjustments: 1 });
    await qa.expectBooking(seed, 1000000, 800000, 200000); expect(await qa.immutable(seed)).toEqual(original);
    expect(await prisma.pricingRevision.count()).toBe(0);
  });

  it('two actually queued refunds600k against original1M commit only600k; fresh500k exceeds residual, fresh400k exhausts exactly once', async () => {
    const seed = await qa.seed(), original = await qa.immutable(seed), body = await qa.adjustment(seed, 'REFUND_PAYMENT', 600000);
    const responses = await qa.race(seed, [async () => await qa.post('payment-adjustments', body), async () => await qa.post('payment-adjustments', body)]);
    expect(responses.map(row => row.status).sort()).toEqual([200, 409]); expectPublicConflict(responses.find(row => row.status === 409)!);
    await qa.expectEffective(seed, { voided: 0, refunded: 600000, net: 400000, adjustments: 1 });
    const before = await qa.durableFacts(), excessive = await qa.adjustment(seed, 'REFUND_PAYMENT', 500000);
    expectPublicConflict(await qa.post('payment-adjustments', excessive)); expect(await qa.durableFacts()).toEqual(before);
    await qa.post('payment-adjustments', await qa.adjustment(seed, 'REFUND_PAYMENT', 400000)).expect(200);
    await qa.expectEffective(seed, { voided: 0, refunded: 1000000, net: 0, adjustments: 2 });
    await qa.expectBooking(seed, 1000000, 0, 1000000); expect(await qa.immutable(seed)).toEqual(original);
    expect(await prisma.financeRequest.count({ where: { operation: 'REFUND_PAYMENT' } })).toBe(2);
    expect(await prisma.financeAudit.count({ where: { action: 'REFUND_PAYMENT' } })).toBe(2);
  }, 30000);

  it('same-key parallel retry and later response recovery keep one adjustment/origin; altered payload is409 without any partial fact', async () => {
    const seed = await qa.seed(), original = await qa.immutable(seed), body = await qa.adjustment(seed, 'REFUND_PAYMENT', 200000), key = randomUUID();
    const responses = await Promise.all([qa.post('payment-adjustments', body, key), qa.post('payment-adjustments', body, key)]);
    expect(responses.map(row => row.status)).toEqual([200, 200]); expect(responses[0].body).toEqual(responses[1].body);
    expect((await qa.post('payment-adjustments', body, key).expect(200)).body).toEqual(responses[0].body);
    const before = await qa.durableFacts(); expectPublicConflict(await qa.post('payment-adjustments', { ...body, amountMinor: 200001 }, key));
    expect(await qa.durableFacts()).toEqual(before); expect(await qa.immutable(seed)).toEqual(original);
    await qa.expectEffective(seed, { voided: 0, refunded: 200000, net: 800000, adjustments: 1 });
    expect(await prisma.financeRequest.count({ where: { operation: 'REFUND_PAYMENT' } })).toBe(1);
  });

  it('queued void/refund admit one legal effect; fresh incompatible follow-up cannot turn the original into two outflows', async () => {
    const seed = await qa.seed(), original = await qa.immutable(seed);
    const voidBody = await qa.adjustment(seed, 'VOID_PAYMENT'), refundBody = await qa.adjustment(seed, 'REFUND_PAYMENT', 300000);
    const responses = await qa.race(seed, [async () => await qa.post('payment-adjustments', voidBody), async () => await qa.post('payment-adjustments', refundBody)]);
    expect(responses.map(row => row.status).sort()).toEqual([200, 409]); expectPublicConflict(responses.find(row => row.status === 409)!);
    const voidWon = responses[0].status === 200;
    await qa.expectEffective(seed, { voided: voidWon ? 1000000 : 0, refunded: voidWon ? 0 : 300000, net: voidWon ? 0 : 700000, adjustments: 1 });
    const before = await qa.durableFacts(), incompatible = await qa.adjustment(seed, voidWon ? 'REFUND_PAYMENT' : 'VOID_PAYMENT', 1);
    expectPublicConflict(await qa.post('payment-adjustments', incompatible)); expect(await qa.durableFacts()).toEqual(before);
    expect(await qa.immutable(seed)).toEqual(original);
    expect(await prisma.financeAudit.count({ where: { action: { in: ['VOID_PAYMENT', 'REFUND_PAYMENT'] } } })).toBe(1);
    expect(await prisma.financeRequest.count({ where: { operation: { in: ['VOID_PAYMENT', 'REFUND_PAYMENT'] } } })).toBe(1);
  }, 30000);

  it('queued void/RecordPayment preserves both legal orders: fresh600k always records; void either commits first or conflicts on financialVersion', async () => {
    const seed = await qa.seed(400000), original = await qa.immutable(seed), voidBody = await qa.adjustment(seed, 'VOID_PAYMENT');
    const paymentKey = randomUUID(), path = `/api/businesses/${fixture.business.id}/bookings/${seed.bookingId}/payments`;
    const record = () => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${qa.ownerToken}`).set('Idempotency-Key', paymentKey).send({ amountMinor: 600000, method: 'CASH', paidAt: D2_REFUND_AT, reference: 'New independent recorded receipt.' });
    const responses = await qa.race(seed, [async () => await qa.post('payment-adjustments', voidBody), async () => await record()]);
    expect(responses[1].status).toBe(201); expect([200, 409]).toContain(responses[0].status);
    if (responses[0].status === 409) expectPublicConflict(responses[0]);
    const voided = responses[0].status === 200;
    await qa.expectEffective(seed, { voided: voided ? 400000 : 0, refunded: 0, net: voided ? 0 : 400000, adjustments: voided ? 1 : 0 });
    await qa.expectBooking(seed, 1000000, voided ? 600000 : 1000000, voided ? 400000 : 0);
    expect(await qa.immutable(seed)).toEqual(original); expect(await prisma.payment.count({ where: { bookingId: seed.bookingId } })).toBe(2);
    expect(await prisma.payment.count({ where: { idempotencyKey: paymentKey } })).toBe(1);
    expect((await record().expect(201)).body).toEqual(responses[1].body);
    const applications = await prisma.$queryRaw<{ applied: string }[]>`SELECT COALESCE(sum("effectiveAmountMinor"),0)::text AS applied FROM "PaymentApplicationEffective" WHERE "businessId"=${fixture.business.id} AND "bookingId"=${seed.bookingId}`;
    expect(applications[0].applied).toBe(voided ? '600000' : '1000000');
    expect((await qa.report()).totals.unassignedPaymentsMinor).toBe(600000);
  }, 30000);

  it('queued refund/manual terminal repricing uses the same price/booking/financial expectations; refreshing the loser converges to800k/credit0', async () => {
    const seed = await qa.seed(1000000, 'NO_SHOW'), original = await qa.immutable(seed);
    const refundBody = await qa.adjustment(seed, 'REFUND_PAYMENT', 200000), finalBody = await qa.terminal(seed, 800000);
    const responses = await qa.race(seed, [async () => await qa.post('payment-adjustments', refundBody), async () => await qa.post('terminal-pricing', finalBody)]);
    expect(responses.map(row => row.status).sort()).toEqual([200, 409]); expectPublicConflict(responses.find(row => row.status === 409)!);
    if (responses[0].status === 200) await qa.post('terminal-pricing', await qa.terminal(seed, 800000)).expect(200);
    else await qa.post('payment-adjustments', await qa.adjustment(seed, 'REFUND_PAYMENT', 200000)).expect(200);
    await qa.expectBooking(seed, 800000, 800000, 0); await qa.expectEffective(seed, { voided: 0, refunded: 200000, net: 800000, adjustments: 1 });
    expect(await qa.immutable(seed)).toEqual(original); expect(await prisma.pricingRevision.count()).toBe(1);
    expect(await prisma.financeRequest.count({ where: { operation: { in: ['REFUND_PAYMENT', 'SET_TERMINAL_FINAL_AMOUNT'] } } })).toBe(2);
    expect(await prisma.financeAudit.count({ where: { action: { in: ['REFUND_PAYMENT', 'SET_TERMINAL_FINAL_AMOUNT'] } } })).toBe(2);
  }, 30000);

  it.each(['VOID_PAYMENT', 'REFUND_PAYMENT', 'SET_TERMINAL_FINAL_AMOUNT'] as const)('real audit failure rolls back %s source/reversals/price/timeline/request completely; the identical retry then commits once', async kind => {
    const seed = await qa.seed(1000000, 'NO_SHOW'), original = await qa.immutable(seed), before = await qa.durableFacts(), guards = await financeGuardEvidence(prisma), key = randomUUID();
    const corrections = app.get(FinanceCorrectionsUseCases);
    let retry!: () => Promise<unknown>;
    await withOwnAuditFailure(prisma, fixture.actor, async marker => {
      const body = kind === 'SET_TERMINAL_FINAL_AMOUNT' ? await qa.terminal(seed, 800000, marker) : await qa.adjustment(seed, kind, 200000, marker);
      retry = kind === 'SET_TERMINAL_FINAL_AMOUNT' ? () => corrections.terminalPricing(fixture.actor, body, key) : () => corrections.paymentAdjustment(fixture.actor, body, key);
      await expect(retry()).rejects.toThrow(marker);
      expect(await qa.durableFacts()).toEqual(before); expect(await qa.immutable(seed)).toEqual(original);
      await qa.expectBooking(seed, 1000000, 1000000, 0); expect((await qa.report()).totals.registeredBalanceMinor).toBe(D2_OPENING + 1000000);
    });
    const saved = await retry(), again = await retry(); expect(again).toEqual(saved); expect(await financeGuardEvidence(prisma)).toEqual(guards);
    expect(await prisma.financeRequest.count({ where: { operation: kind } })).toBe(1); expect(await prisma.financeAudit.count({ where: { action: kind } })).toBe(1);
    if (kind === 'SET_TERMINAL_FINAL_AMOUNT') { expect(await prisma.pricingRevision.count()).toBe(1); await qa.expectBooking(seed, 800000, 1000000, 0, 200000); }
    else await qa.expectEffective(seed, { voided: kind === 'VOID_PAYMENT' ? 1000000 : 0, refunded: kind === 'REFUND_PAYMENT' ? 200000 : 0, net: kind === 'VOID_PAYMENT' ? 0 : 800000, adjustments: 1 });
    expect(await qa.immutable(seed)).toEqual(original);
  }, 30000);

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const)('%s cannot read correction detail or write void/refund/manual final even with otherwise valid sources', async role => {
    const seed = await qa.seed(1000000, 'NO_SHOW'), token = await realFinanceToken(app, fixture.users[role].id);
    const voidBody = await qa.adjustment(seed, 'VOID_PAYMENT'), refundBody = await qa.adjustment(seed, 'REFUND_PAYMENT', 200000), finalBody = await qa.terminal(seed, 800000), before = await qa.durableFacts();
    await request(app.getHttpServer()).get(`${qa.base()}/corrections`).set('Authorization', `Bearer ${token}`).expect(403);
    for (const body of [voidBody, refundBody]) await qa.post('payment-adjustments', body, randomUUID(), token).expect(403);
    await qa.post('terminal-pricing', finalBody, randomUUID(), token).expect(403); expect(await qa.durableFacts()).toEqual(before);
  });

  it('two tenant contexts and foreign Payment/Booking/account IDs return403 or indistinguishable404 with every financial fact unchanged', async () => {
    const own = await qa.seed(1000000, 'NO_SHOW'), foreign = await qa.seed(1000000, 'NO_SHOW', true), body = await qa.adjustment(own, 'REFUND_PAYMENT', 200000), before = await qa.durableFacts();
    const foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    await qa.post('payment-adjustments', body, randomUUID(), foreignToken).expect(403);
    await qa.post('payment-adjustments', body, randomUUID(), qa.ownerToken, fixture.foreignBusiness.id).expect(403);
    for (const field of ['paymentId', 'bookingId', 'accountId'] as const) {
      const denied = await qa.post('payment-adjustments', { ...body, [field]: foreign[field] }).expect(404);
      const absent = await qa.post('payment-adjustments', { ...body, [field]: randomUUID() }).expect(404);
      expect(denied.body).toEqual(absent.body); expect(JSON.stringify(denied.body)).not.toContain(foreign[field]);
    }
    expect(await qa.durableFacts()).toEqual(before); await qa.expectBooking(own, 1000000, 1000000, 0);
  });

  it('current membership is revalidated before recovering an already committed idempotent refund response', async () => {
    const seed = await qa.seed(), body = await qa.adjustment(seed, 'REFUND_PAYMENT', 200000), key = randomUUID();
    await qa.post('payment-adjustments', body, key).expect(200); const before = await qa.durableFacts();
    await prisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: fixture.actor.actorUserId, businessId: fixture.business.id } } });
    await qa.post('payment-adjustments', body, key).expect(403);
    await request(app.getHttpServer()).get(`${qa.base()}/corrections`).set('Authorization', `Bearer ${qa.ownerToken}`).expect(403);
    expect(await qa.durableFacts()).toEqual(before);
  });

  it('absent JWT rejects each read/void/refund/manual-final route before revealing or changing monetary facts', async () => {
    const seed = await qa.seed(1000000, 'NO_SHOW'), before = await qa.durableFacts();
    const bodies = [await qa.adjustment(seed, 'VOID_PAYMENT'), await qa.adjustment(seed, 'REFUND_PAYMENT', 200000)];
    await request(app.getHttpServer()).get(`${qa.base()}/corrections`).expect(401);
    for (const body of bodies) await qa.post('payment-adjustments', body, randomUUID(), null).expect(401);
    await qa.post('terminal-pricing', await qa.terminal(seed, 800000), randomUUID(), null).expect(401);
    expect(await qa.durableFacts()).toEqual(before);
  });
});
