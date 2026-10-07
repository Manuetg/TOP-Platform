import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { FinanceReport } from '../../../src/modules/finance/domain/finance.types';
import type { FinanceV2Result } from '../../../src/modules/finance/domain/finance-v2.types';
import { assertFinanceDatabase, financePeriod, type FinanceFixture } from '../../fixtures/finance-fixture';

export class FinanceGoldensQa {
  constructor(readonly app: INestApplication, readonly prisma: PrismaClient, readonly fixture: FinanceFixture, readonly ownerToken: string) {}
  base(businessId = this.fixture.business.id): string { return `/api/businesses/${businessId}/finance`; }
  get(path: string, token = this.ownerToken, businessId = this.fixture.business.id): request.Test { return request(this.app.getHttpServer()).get(`${this.base(businessId)}/v2/${path}`).set('Authorization', `Bearer ${token}`); }
  post(path: string, body: object, token = this.ownerToken, businessId = this.fixture.business.id): request.Test { return request(this.app.getHttpServer()).post(`${this.base(businessId)}/v2/${path}`).set('Authorization', `Bearer ${token}`).send(body); }
  command(body: object, key: string = randomUUID(), token = this.ownerToken, businessId = this.fixture.business.id): request.Test { return this.post('commands', body, token, businessId).set('Idempotency-Key', key); }
  v1(body: object, token = this.ownerToken, businessId = this.fixture.business.id): request.Test { return request(this.app.getHttpServer()).post(`${this.base(businessId)}/commands`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send(body); }
  async report(token = this.ownerToken, businessId = this.fixture.business.id): Promise<FinanceReport> { return (await request(this.app.getHttpServer()).get(this.base(businessId)).set('Authorization', `Bearer ${token}`).query(financePeriod).expect(200)).body as FinanceReport; }
  async facts(): Promise<unknown[]> {
    const businessId = { in: [this.fixture.business.id, this.fixture.foreignBusiness.id] }, orderBy = { id: 'asc' as const };
    return Promise.all([this.prisma.financeCommitment.findMany({ where: { businessId }, orderBy }), this.prisma.financeCommitmentConversion.findMany({ where: { businessId }, orderBy }), this.prisma.financeExpense.findMany({ where: { businessId }, orderBy, include: { lines: { orderBy }, settlements: { orderBy } } }), this.prisma.financeAudit.findMany({ where: { businessId }, orderBy }), this.prisma.financeRequest.findMany({ where: { businessId }, orderBy }), this.prisma.financeBankMatch.findMany({ where: { businessId }, orderBy }), this.prisma.financeBankMatchComponent.findMany({ where: { businessId }, orderBy }), this.prisma.financeBankRow.findMany({ where: { businessId }, orderBy }), this.prisma.financeBankFeeOrigin.findMany({ where: { businessId }, orderBy }), this.prisma.financeCashMovement.findMany({ where: { businessId }, orderBy })]);
  }
  async expectOneV2Origin(operation: string, result: FinanceV2Result, key: string): Promise<void> {
    const businessId = this.fixture.business.id;
    const requests = await this.prisma.financeRequest.findMany({ where: { businessId, operation: `FINANCE_V2.${operation}`, idempotencyKey: key } });
    expect(requests).toHaveLength(1); expect(requests[0].result).toEqual(result);
    const audits = await this.prisma.financeAudit.findMany({ where: { businessId, action: `FINANCE_V2.${operation}`, sourceId: result.id } });
    expect(audits).toHaveLength(1); expect(audits[0].actorUserId).toBe(this.fixture.actor.actorUserId);
  }
  async businessRace(calls: [() => Promise<request.Response>, () => Promise<request.Response>]): Promise<request.Response[]> {
    await assertFinanceDatabase(this.prisma); let pending: Promise<request.Response>[] = [];
    try {
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id=${this.fixture.business.id} FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        pending = calls.map(call => call()); await waitForOwnWaiters(this.prisma, pid);
      }, { maxWait: 5000, timeout: 10000 });
    } catch (error: unknown) { await Promise.allSettled(pending); throw error; }
    return Promise.all(pending);
  }
}

async function waitForOwnWaiters(prisma: PrismaClient, holder: number): Promise<void> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`WITH RECURSIVE descendants(pid) AS (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND ${holder}=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN descendants d ON d.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()) SELECT count(*) AS count FROM descendants`;
    if (count >= 2n) return; await new Promise<void>(resolve => setTimeout(resolve, 25));
  }
  throw new Error('QA: two actual HTTP writers must wait on the own Business barrier.');
}

export function requiredGolden<T>(value: T | undefined): T { if (value === undefined) throw new Error('QA: required real source is absent.'); return value; }
export function expectSafeRejection(response: request.Response, status: 400 | 403 | 404 | 409): void {
  expect(response.status).toBe(status); expect(response.body).toMatchObject({ statusCode: status });
  expect(JSON.stringify(response.body)).not.toMatch(/SELECT|INSERT|UPDATE|DELETE|pg_|Prisma|deadlock|constraint|stack|requestFingerprint/i);
}
