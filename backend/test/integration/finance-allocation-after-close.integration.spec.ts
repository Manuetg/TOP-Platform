import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import { FinancePeriodClosedError } from '../../src/shared/infrastructure/finance-period.guard';
import { FINANCE_CLOSE_OPERATIONS, type FinanceCloseOperations, type FinanceCloseAcknowledgements } from '../../src/modules/finance/application/finance-close.operations';
import { FINANCE_CLOSE_WRITERS } from '../../src/modules/finance/domain/finance-close.rules';
import { FINANCE_REPOSITORY, type FinanceRepository } from '../../src/modules/finance/domain/finance.types';
import { FINANCE_V2_REPOSITORY, type FinanceV2Command, type FinanceV2Repository } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, financeMutation, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

const september = { from: '2026-09-01', to: '2026-10-01' };
const acknowledgements: FinanceCloseAcknowledgements = {
  RECOGNITION_COVERAGE: 'QA: no se inventa ingreso por servicio no certificado.',
  ACCOUNT_OPENINGS: 'QA: no se infiere caja de cuentas sin apertura.',
  EVIDENCE: 'QA: las fuentes sinteticas conservan su referencia explicita.',
  MOVEMENT_REVIEW: 'QA: toda excepcion de movimientos sigue visible.',
  CASH_COUNTS: 'QA: no se inventa arqueo ni se elimina una diferencia.',
};

// AppModule/DI, transacciones y guardias PostgreSQL reales; root es el unico runner.
describe('FIN023/029: asignaciones de octubre despues del cierre de septiembre', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: FinanceFixture;
  let finance: FinanceRepository;
  let v2: FinanceV2Repository;
  let close: FinanceCloseOperations;
  let token: string;
  let secondResourceId: string;

  beforeAll(async () => {
    app = await createFinanceApp();
    prisma = app.get<PrismaService>(PrismaService);
    finance = app.get<FinanceRepository>(FINANCE_REPOSITORY);
    v2 = app.get<FinanceV2Repository>(FINANCE_V2_REPOSITORY);
    close = app.get<FinanceCloseOperations>(FINANCE_CLOSE_OPERATIONS);
  });
  beforeEach(async () => {
    await resetFinanceDatabase(prisma);
    fixture = await financeFixture(prisma);
    token = await realFinanceToken(app, fixture.users.OWNER.id);
    const resource = await prisma.resource.create({ data: { businessId: fixture.business.id, name: 'Segundo destino QA', internalCode: 'QA_ALLOCATION_SECOND', capacityMaximum: 2 } });
    secondResourceId = resource.id;
  });
  afterEach(async () => { await resetFinanceDatabase(prisma); });
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  function mutate(command: FinanceV2Command) {
    return v2.execute({ ...fixture.actor, command, idempotencyKey: randomUUID(), fingerprint: createHash('sha256').update(JSON.stringify(command)).digest('hex') });
  }
  async function commonExpense(consumedOn: string, amountMinor: number) {
    const command = expenseCommand(fixture, amountMinor);
    const result = await finance.execute(financeMutation(fixture.actor, {
      ...command, consumedOn, reference: 'Referencia sintetica conservada',
      lines: command.lines.map(line => ({ ...line, resourceId: null })),
    }));
    const lines = await prisma.financeExpenseLine.findMany({ where: { businessId: fixture.business.id, expenseId: result.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amountMinor: BigInt(amountMinor), resourceId: null, bookingId: null, operational: true });
    return { expenseId: result.id, lineId: lines[0].id, version: result.version };
  }
  function allocation(lineId: string, sourceVersion: number, ruleId: string, ruleVersion: number, expectedAllocationVersion = 0): Extract<FinanceV2Command, { type: 'APPLY_COST_ALLOCATION' }> {
    return { type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: lineId }, expectedSourceVersion: sourceVersion, ruleId, ruleVersion, expectedAllocationVersion, reason: 'Asignacion explicita conservando fuente, vigencia e importe.' };
  }
  async function closedSeptember() {
    const source = await commonExpense('2026-09-30', 100000);
    const rule = await mutate({ type: 'CREATE_ALLOCATION_RULE', name: 'Regla septiembre 60/40', validFrom: '2026-09-01', validTo: null, parts: [{ resourceId: fixture.resource.id, basisPoints: 6000 }, { resourceId: secondResourceId, basisPoints: 4000 }] });
    const applied = await mutate(allocation(source.lineId, source.version, rule.id, rule.version));
    const persisted = await prisma.financeCostAllocation.findUniqueOrThrow({ where: { id: applied.id } });
    expect(persisted).toMatchObject({ revisionNo: 1, sourceExpenseLineId: source.lineId, sourceAmountMinor: 100000n, unassignedMinor: 0n });
    await expectParts(applied.id, 60000n, 40000n);
    const ruleParts = await prisma.financeAllocationRulePart.findMany({ where: { businessId: fixture.business.id, revisionId: persisted.ruleRevisionId }, orderBy: { id: 'asc' } });
    expect(ruleParts).toHaveLength(2);
    const period = await close.createPeriod(fixture.actor, { ...september, reason: 'Cierre sintetico real de septiembre.' }, randomUUID());
    const prepared = await close.prepareClose(fixture.actor, period.id);
    expect([...prepared.guardedWriters].sort()).toEqual([...FINANCE_CLOSE_WRITERS].sort());
    expect(prepared.checklist.filter(row => row.severity === 'BLOCKER' && !row.passed)).toEqual([]);
    const result = await close.closePeriod(fixture.actor, period.id, { expectedVersion: period.version, expectedSourceToken: prepared.sourceToken, reason: 'OWNER cierra septiembre con excepciones declaradas.', acknowledgements }, randomUUID());
    expect(result.period.status).toBe('CLOSED');
    if (!result.snapshot) throw new Error('El cierre real debe producir snapshot.');
    const snapshot = await close.readSnapshot(fixture.actor, period.id, result.snapshot.id);
    expect(snapshot.sourceRefs).toContainEqual(expect.objectContaining({ type: 'COST_RULE_REVISION', id: persisted.ruleRevisionId, version: expect.any(String) }));
    for (const part of ruleParts) expect(snapshot.sourceRefs).toContainEqual(expect.objectContaining({ type: 'COST_RULE_PART', id: part.id, version: expect.any(String) }));
    expect(snapshot.sourceRefs.some(ref => ref.type === 'COST_RULE' && ref.id === rule.id)).toBe(false);
    const stored = await prisma.financeCloseSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
    expect(stored.payloadHash).toBe(snapshot.payloadHash);
    return { source, rule, applied, persisted, ruleParts, period: result.period, snapshot, stored };
  }
  type ClosedSeptember = Awaited<ReturnType<typeof closedSeptember>>;
  async function expectParts(allocationId: string, first: bigint, second: bigint): Promise<void> {
    const parts = await prisma.financeCostAllocationPart.findMany({ where: { businessId: fixture.business.id, allocationId } });
    expect(parts).toHaveLength(2);
    expect(parts.map(part => ({ resourceId: part.resourceId, amountMinor: part.amountMinor }))).toEqual(expect.arrayContaining([{ resourceId: fixture.resource.id, amountMinor: first }, { resourceId: secondResourceId, amountMinor: second }]));
    expect(parts.reduce((total, part) => total + part.amountMinor, 0n)).toBe(first + second);
  }
  async function expectSnapshotPreserved(value: ClosedSeptember): Promise<void> {
    expect(await close.readSnapshot(fixture.actor, value.period.id, value.snapshot.id)).toEqual(value.snapshot);
    expect(await prisma.financeCloseSnapshot.findUniqueOrThrow({ where: { id: value.snapshot.id } })).toEqual(value.stored);
    expect(await prisma.financeCostAllocation.findUniqueOrThrow({ where: { id: value.applied.id } })).toEqual(value.persisted);
    expect(await prisma.financeAllocationRulePart.findMany({ where: { businessId: fixture.business.id, revisionId: value.persisted.ruleRevisionId }, orderBy: { id: 'asc' } })).toEqual(value.ruleParts);
  }
  async function counts() {
    const [requests, audits, allocations, allocationParts, ruleRevisions, ruleParts, snapshots] = await Promise.all([
      prisma.financeRequest.count(), prisma.financeAudit.count(), prisma.financeCostAllocation.count(), prisma.financeCostAllocationPart.count(),
      prisma.financeAllocationRuleRevision.count(), prisma.financeAllocationRulePart.count(), prisma.financeCloseSnapshot.count(),
    ]);
    return { requests, audits, allocations, allocationParts, ruleRevisions, ruleParts, snapshots };
  }
  async function expectSeptemberReallocation409(value: ClosedSeptember): Promise<void> {
    const before = await counts();
    const response = await request(app.getHttpServer()).post(`/api/businesses/${fixture.business.id}/finance/v2/commands`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID())
      .send(allocation(value.source.lineId, value.source.version, value.rule.id, value.rule.version, 1)).expect(409);
    expect(response.body).toMatchObject({ statusCode: 409, message: new FinancePeriodClosedError().message });
    expect(await counts()).toEqual(before);
    await expectSnapshotPreserved(value);
  }

  it('permite revision de la misma regla desde octubre y conserva revision/partes/snapshot consumidos en septiembre', async () => {
    const value = await closedSeptember();
    // Antes de revisar el head, este intento es valido en todos los contratos salvo el cierre.
    await expectSeptemberReallocation409(value);
    const revised = await mutate({ type: 'REVISE_ALLOCATION_RULE', id: value.rule.id, expectedVersion: value.rule.version, validFrom: '2026-10-01', validTo: null, parts: [{ resourceId: fixture.resource.id, basisPoints: 2500 }, { resourceId: secondResourceId, basisPoints: 7500 }], reason: 'Nueva vigencia de octubre sin reescribir la revision cerrada.' });
    expect(revised).toMatchObject({ id: value.rule.id, version: 2 });
    const source = await commonExpense('2026-10-02', 250000);
    const applied = await mutate(allocation(source.lineId, source.version, revised.id, revised.version));
    const persisted = await prisma.financeCostAllocation.findUniqueOrThrow({ where: { id: applied.id } });
    expect(persisted).toMatchObject({ revisionNo: 1, sourceExpenseLineId: source.lineId, sourceAmountMinor: 250000n, unassignedMinor: 0n });
    expect(persisted.ruleRevisionId).not.toBe(value.persisted.ruleRevisionId);
    await expectParts(applied.id, 62500n, 187500n);
    expect(await prisma.financeAllocationRule.count({ where: { businessId: fixture.business.id } })).toBe(1);
    expect(await prisma.financeAllocationRuleRevision.count({ where: { businessId: fixture.business.id, ruleId: revised.id } })).toBe(2);
    await expectSnapshotPreserved(value);
  });

  it('permite regla nueva vigente octubre; septiembre sigue rechazando una reasignacion valida sin hechos parciales', async () => {
    const value = await closedSeptember();
    const rule = await mutate({ type: 'CREATE_ALLOCATION_RULE', name: 'Nueva regla octubre 50/50', validFrom: '2026-10-01', validTo: null, parts: [{ resourceId: fixture.resource.id, basisPoints: 5000 }, { resourceId: secondResourceId, basisPoints: 5000 }] });
    const source = await commonExpense('2026-10-02', 250000);
    const applied = await mutate(allocation(source.lineId, source.version, rule.id, rule.version));
    expect(await prisma.financeCostAllocation.findUniqueOrThrow({ where: { id: applied.id } })).toMatchObject({ sourceExpenseLineId: source.lineId, sourceAmountMinor: 250000n, unassignedMinor: 0n });
    await expectParts(applied.id, 125000n, 125000n);
    expect(await prisma.financeAllocationRule.count({ where: { businessId: fixture.business.id } })).toBe(2);
    expect(await prisma.financeExpense.findUniqueOrThrow({ where: { id: value.source.expenseId } })).toMatchObject({ amountMinor: 100000n, version: 1 });
    expect(await prisma.financeExpense.findUniqueOrThrow({ where: { id: source.expenseId } })).toMatchObject({ amountMinor: 250000n, version: 1 });
    await expectSeptemberReallocation409(value);
    await expectSnapshotPreserved(value);
  });
});
