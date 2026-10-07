import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { FinanceConflictError, FinanceNotFoundError } from '../../src/modules/finance/domain/finance.errors';
import type { FinanceCommand, FinanceResult } from '../../src/modules/finance/domain/finance.types';
import {
  assertFinanceDatabase, expenseCommand, financeFixture, financeInstant, financeMutation,
  financePaymentFixture, financePeriod, paymentFingerprint, resetFinanceDatabase, type FinanceFixture,
} from '../fixtures/finance-fixture';

function createSignal<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => { resolve = release; });
  return { promise, resolve };
}

describe('Finance V1: hechos financieros en PostgreSQL real', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaFinanceRepository(prisma);
  let fixture: FinanceFixture;

  beforeAll(async () => { await prisma.$connect(); await assertFinanceDatabase(prisma); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => prisma.$disconnect());

  const execute = (command: FinanceCommand, key?: string) => repository.execute(financeMutation(fixture.actor, command, key));
  const report = () => repository.report(fixture.actor, financePeriod);
  const account = (amountMinor = 1000000, kind: 'CASH' | 'BANK' = 'BANK') => execute({
    type: 'CREATE_ACCOUNT', kind, name: `Cuenta ${kind}`, opening: { amountMinor, occurredAt: financeInstant, reason: 'Apertura conocida sintética' },
  });

  it('gasto pendiente 900000 mantiene costo900000, deuda900000 y no inventa cuenta o caja conocida', async () => {
    const created = await execute(expenseCommand(fixture));
    const value = await report();
    expect(value.totals).toMatchObject({ expenseMinor: 900000, operatingCostMinor: 900000, outstandingMinor: 900000, settlementsMinor: 0, registeredBalanceMinor: null });
    expect(value.accounts).toEqual([]);
    expect(value.expenses).toHaveLength(1);
    expect(value.expenses[0]).toMatchObject({ id: created.id, amountMinor: 900000, paidAmountMinor: 0, outstandingMinor: 900000, consumedOn: '2026-09-30', evidenceMissing: true });
    expect(value.movements).toEqual([]);
    const detail = await repository.expense(fixture.actor, created.id);
    expect(detail.audit).toHaveLength(1);
    expect(detail.audit[0]).toMatchObject({ actorUserId: fixture.actor.actorUserId, sourceId: created.id });
  });

  it('apertura1000000 y pago300000 dejan deuda600000, caja700000 y costo900000', async () => {
    const bank = await account();
    const expense = await execute(expenseCommand(fixture));
    await execute({ type: 'SETTLE_EXPENSE', id: expense.id, expectedVersion: expense.version, settlement: { accountId: bank.id, amountMinor: 300000, occurredAt: '2026-10-02T12:00:00Z', reference: 'Pago realizado fuera de TOP' } });
    const value = await report();
    expect(value.totals).toMatchObject({ expenseMinor: 900000, operatingCostMinor: 900000, settlementsMinor: 300000, outstandingMinor: 600000, registeredBalanceMinor: 700000 });
    expect(value.accounts[0]).toMatchObject({ id: bank.id, balanceMinor: 700000 });
    expect(value.expenses[0]).toMatchObject({ paidAmountMinor: 300000, outstandingMinor: 600000, version: 2 });
    expect(value.expenses[0].settlements).toHaveLength(1);
  });

  it('alta pagada crea documento, líneas, aplicación y auditoría en un resultado', async () => {
    const bank = await account();
    const command = { ...expenseCommand(fixture), settlement: { accountId: bank.id, amountMinor: 900000, occurredAt: financeInstant, reference: null } };
    const created = await execute(command);
    const value = await report();
    expect(value.totals).toMatchObject({ operatingCostMinor: 900000, settlementsMinor: 900000, outstandingMinor: 0, registeredBalanceMinor: 100000 });
    expect(value.expenses[0]).toMatchObject({ id: created.id, outstandingMinor: 0 });
    expect(value.expenses[0].settlements).toHaveLength(1);
    expect(await prisma.financeAudit.count({ where: { sourceId: created.id } })).toBe(1);
  });

  it('si falla auditoría PostgreSQL revierte gasto pagado, líneas, pago y llave; retry después conserva un hecho', async () => {
    const bank = await account();
    const command = { ...expenseCommand(fixture), settlement: { accountId: bank.id, amountMinor: 300000, occurredAt: financeInstant, reference: null } };
    const key = randomUUID();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION finance_qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'finance_qa_injected_audit_failure'; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER finance_qa_fail_audit BEFORE INSERT ON "FinanceAudit" FOR EACH ROW EXECUTE FUNCTION finance_qa_fail_audit()`);
    try {
      await expect(execute(command, key)).rejects.toThrow('finance_qa_injected_audit_failure');
      expect(await prisma.financeExpense.count()).toBe(0);
      expect(await prisma.financeExpenseLine.count()).toBe(0);
      expect(await prisma.financeSettlement.count()).toBe(0);
      expect(await prisma.financeRequest.count({ where: { idempotencyKey: key } })).toBe(0);
      expect((await report()).totals.registeredBalanceMinor).toBe(1000000);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER finance_qa_fail_audit ON "FinanceAudit"');
      await prisma.$executeRawUnsafe('DROP FUNCTION finance_qa_fail_audit()');
    }
    await execute(command, key);
    await execute(command, key);
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(await prisma.financeSettlement.count()).toBe(1);
    expect((await report()).totals.registeredBalanceMinor).toBe(700000);
  });

  it('dos pagos600000 contra900000 permiten solo uno y el perdedor no deja fila ni auditoría', async () => {
    const bank = await account();
    const expense = await execute(expenseCommand(fixture));
    const command: FinanceCommand = { type: 'SETTLE_EXPENSE', id: expense.id, expectedVersion: 1, settlement: { accountId: bank.id, amountMinor: 600000, occurredAt: financeInstant, reference: null } };
    const attempts = await Promise.allSettled([execute(command), execute(command)]);
    expect(attempts.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(value => value.status === 'rejected')).toHaveLength(1);
    expect(await prisma.financeSettlement.count()).toBe(1);
    expect((await report()).totals).toMatchObject({ outstandingMinor: 300000, settlementsMinor: 600000, operatingCostMinor: 900000, registeredBalanceMinor: 400000 });
  });

  it('retry idéntico concurrente y respuesta perdida devuelven ID original con una fila y auditoría', async () => {
    const command = expenseCommand(fixture);
    const key = randomUUID();
    const results = await Promise.all([execute(command, key), execute(command, key)]);
    expect(results[0]).toEqual(results[1]);
    expect(await execute(command, key)).toEqual(results[0]);
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(await prisma.financeAudit.count({ where: { sourceId: results[0].id } })).toBe(1);
  });

  it('misma llave con contenido diferente falla sin reemplazar el gasto original', async () => {
    const key = randomUUID();
    const created = await execute(expenseCommand(fixture), key);
    await expect(execute(expenseCommand(fixture, 800000), key)).rejects.toBeInstanceOf(FinanceConflictError);
    const detail = await repository.expense(fixture.actor, created.id);
    expect(detail.expense.amountMinor).toBe(900000);
    expect(detail.audit).toHaveLength(1);
  });

  it('la misma llave por dos tenants conserva dos hechos privados', async () => {
    const key = randomUUID();
    const first = await execute({ type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'Mismo nombre' }, key);
    const second = await repository.execute(financeMutation(fixture.foreignActor, { type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'Mismo nombre' }, key));
    expect(first.id).not.toBe(second.id);
    const own = await report();
    expect(own.catalogs.map(value => value.id)).toContain(first.id);
    expect(own.catalogs.map(value => value.id)).not.toContain(second.id);
  });

  it.each(['category', 'counterparty', 'resource'] as const)('rechaza %s ajeno sin fila parcial ni revelar detalle', async (reference) => {
    const command = expenseCommand(fixture);
    if (reference === 'category') command.lines[0].categoryId = fixture.foreignCategory.id;
    if (reference === 'counterparty') command.counterpartyId = fixture.foreignCounterparty.id;
    if (reference === 'resource') command.lines[0].resourceId = fixture.foreignResource.id;
    await expect(execute(command)).rejects.toBeInstanceOf(FinanceNotFoundError);
    expect(await prisma.financeExpense.count()).toBe(0);
    expect(await prisma.financeExpenseLine.count()).toBe(0);
  });

  it.each(['OUT_OF_SERVICE', 'ARCHIVED'] as const)('costo del recurso propio %s conserva imputación y no cambia su estado reservable', async status => {
    await prisma.resource.update({ where: { id: fixture.resource.id }, data: { status } });
    const expense = await execute(expenseCommand(fixture));
    const detail = await repository.expense(fixture.actor, expense.id);
    expect(detail.expense.lines[0]).toMatchObject({ resourceId: fixture.resource.id, resourceName: 'Cabaña QA', amountMinor: 900000 });
    expect((await report()).totals).toMatchObject({ operatingCostMinor: 900000, outstandingMinor: 900000 });
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: fixture.resource.id } })).status).toBe(status);
  });

  it('cuenta ajena impide alta pagada entera y no cambia saldo extranjero', async () => {
    const foreignBank = await repository.execute(financeMutation(fixture.foreignActor, { type: 'CREATE_ACCOUNT', name: 'Ajena', kind: 'BANK', opening: { amountMinor: 1000000, occurredAt: financeInstant, reason: 'Apertura' } }));
    await expect(execute({ ...expenseCommand(fixture), settlement: { accountId: foreignBank.id, amountMinor: 300000, occurredAt: financeInstant, reference: null } })).rejects.toBeInstanceOf(FinanceNotFoundError);
    expect(await prisma.financeExpense.count()).toBe(0);
    expect(await prisma.financeSettlement.count()).toBe(0);
    expect((await repository.report(fixture.foreignActor, financePeriod)).totals.registeredBalanceMinor).toBe(1000000);
  });

  it('detalle y auditoría de gasto ajeno son indistinguibles de ID inexistente', async () => {
    const expense = await execute(expenseCommand(fixture));
    await expect(repository.expense(fixture.foreignActor, expense.id)).rejects.toBeInstanceOf(FinanceNotFoundError);
    await expect(repository.expense(fixture.foreignActor, randomUUID())).rejects.toBeInstanceOf(FinanceNotFoundError);
  });

  it('archivar categoría conserva nombre histórico; CAS viejo falla antes del no-op', async () => {
    const expense = await execute(expenseCommand(fixture));
    await execute({ type: 'ARCHIVE_CATALOG', id: fixture.category.id, expectedVersion: 1, reason: 'Ya no usar' });
    await expect(execute({ type: 'ARCHIVE_CATALOG', id: fixture.category.id, expectedVersion: 1, reason: 'No-op viejo' })).rejects.toBeInstanceOf(FinanceConflictError);
    const detail = await repository.expense(fixture.actor, expense.id);
    expect(detail.expense.lines[0].categoryName).toBe('Reparaciones');
    await expect(execute(expenseCommand(fixture))).rejects.toThrow();
    expect(await prisma.financeExpense.count()).toBe(1);
  });

  it('evidencia usa CAS antes del mismo valor; conflicto conserva versión, referencia y auditoría', async () => {
    const expense = await execute(expenseCommand(fixture));
    await execute({ type: 'SET_EVIDENCE', id: expense.id, expectedVersion: 1, reference: 'Comprobante privado 123', reason: 'Adjuntar referencia' });
    const auditCount = await prisma.financeAudit.count({ where: { sourceId: expense.id } });
    await expect(execute({ type: 'SET_EVIDENCE', id: expense.id, expectedVersion: 1, reference: 'Comprobante privado 123', reason: 'Mismo valor' })).rejects.toBeInstanceOf(FinanceConflictError);
    const detail = await repository.expense(fixture.actor, expense.id);
    expect(detail.expense).toMatchObject({ version: 2, reference: 'Comprobante privado 123', evidenceMissing: false });
    expect(detail.audit).toHaveLength(auditCount);
    expect(detail.audit.length).toBeGreaterThanOrEqual(2);
  });

  it('protecciones PostgreSQL impiden reescribir o borrar la fuente financiera histórica', async () => {
    const expense = await execute(expenseCommand(fixture));
    await expect(prisma.$executeRaw`UPDATE "FinanceExpense" SET "amountMinor"=1 WHERE id=${expense.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "FinanceExpense" WHERE id=${expense.id}`).rejects.toThrow();
    expect((await repository.expense(fixture.actor, expense.id)).expense.amountMinor).toBe(900000);
    const audit = await prisma.financeAudit.findFirstOrThrow({ where: { sourceId: expense.id } });
    await expect(prisma.$executeRaw`UPDATE "FinanceAudit" SET action='forged' WHERE id=${audit.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "FinanceAudit" WHERE id=${audit.id}`).rejects.toThrow();
    expect(await prisma.financeAudit.count({ where: { sourceId: expense.id } })).toBe(1);
  });

  it('las relaciones compuestas DB rechazan categoría/recurso/pago ajenos incluso sin API', async () => {
    const expense = await execute(expenseCommand(fixture));
    const line = { businessId: fixture.business.id, expenseId: expense.id, label: 'Intento SQL', categoryId: fixture.category.id, resourceId: fixture.resource.id, amountMinor: 1n, operational: true };
    await expect(prisma.financeExpenseLine.create({ data: { ...line, categoryId: fixture.foreignCategory.id } })).rejects.toThrow();
    await expect(prisma.financeExpenseLine.create({ data: { ...line, resourceId: fixture.foreignResource.id } })).rejects.toThrow();
    const ownAccount = await account();
    const { payment } = await financePaymentFixture(prisma, fixture.foreignActor);
    await expect(prisma.financePaymentLink.create({ data: { businessId: fixture.business.id, paymentId: payment.id, accountId: ownAccount.id, recordedByUserId: fixture.actor.actorUserId } })).rejects.toThrow();
    expect(await prisma.financeExpenseLine.count()).toBe(1);
    expect(await prisma.financePaymentLink.count()).toBe(0);
  });

  it('líneas operativas y no operativas conservan documento y obligación sin duplicar costo', async () => {
    const command = expenseCommand(fixture, 100001);
    command.lines = [
      { ...command.lines[0], amountMinor: 60000 },
      { ...command.lines[0], label: 'Inversión no operativa', amountMinor: 40001, operational: false, resourceId: null },
    ];
    await execute(command);
    const value = await report();
    expect(value.totals).toMatchObject({ expenseMinor: 100001, operatingCostMinor: 60000, outstandingMinor: 100001 });
    expect(value.expenses[0].lines).toHaveLength(2);
  });

  it('transferencia300000 conserva consolidado1000000 y aportes/retiros no son gasto ni cobro', async () => {
    const bank = await account();
    const cash = await account(0, 'CASH');
    const transfer = { type: 'TRANSFER', fromAccountId: bank.id, toAccountId: cash.id, amountMinor: 300000, occurredAt: '2026-10-02T12:00:00Z', reason: 'Efectivo ya movido' } as const;
    const key = randomUUID();
    await execute(transfer, key);
    await execute(transfer, key);
    let value = await report();
    expect(value.accounts.find(row => row.id === bank.id)?.balanceMinor).toBe(700000);
    expect(value.accounts.find(row => row.id === cash.id)?.balanceMinor).toBe(300000);
    expect(value.totals.registeredBalanceMinor).toBe(1000000);
    await execute({ type: 'CASH_MOVEMENT', accountId: cash.id, kind: 'CONTRIBUTION', amountMinor: 100000, occurredAt: '2026-10-03T12:00:00Z', reason: 'Aporte propio', openingId: null });
    await execute({ type: 'CASH_MOVEMENT', accountId: cash.id, kind: 'WITHDRAWAL', amountMinor: 200000, occurredAt: '2026-10-04T12:00:00Z', reason: 'Retiro dueño', openingId: null });
    value = await report();
    expect(value.totals).toMatchObject({ registeredBalanceMinor: 900000, expenseMinor: 0, operatingCostMinor: 0, paymentsMinor: 0 });
    expect(value.movements.filter(row => row.sourceType === 'TRANSFER')).toHaveLength(2);
    expect(await prisma.financeTransfer.count()).toBe(1);
  });

  it('saldo negativo registra pago externo real sin inventar sobregiro prohibido', async () => {
    const bank = await account(100000);
    const expense = await execute(expenseCommand(fixture));
    await execute({ type: 'SETTLE_EXPENSE', id: expense.id, expectedVersion: 1, settlement: { accountId: bank.id, amountMinor: 300000, occurredAt: financeInstant, reference: null } });
    expect((await report()).accounts[0]).toMatchObject({ balanceMinor: -200000, negative: true });
  });

  it('vincular/corregir cobro no altera Payment, Snapshot, Revision, Plan o Applications', async () => {
    const bank = await account();
    const cash = await account(0, 'CASH');
    const { booking, payment } = await financePaymentFixture(prisma, fixture.actor);
    const original = await paymentFingerprint(prisma, booking.id);
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Cobrado en banco' });
    expect((await report()).totals).toMatchObject({ paymentsMinor: 400000, registeredBalanceMinor: 1400000 });
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: cash.id, expectedVersion: 1, reason: 'Corregir cuenta informativa' });
    const value = await report();
    expect(value.accounts.find(row => row.id === bank.id)?.balanceMinor).toBe(1000000);
    expect(value.accounts.find(row => row.id === cash.id)?.balanceMinor).toBe(400000);
    expect(value.totals.registeredBalanceMinor).toBe(1400000);
    expect(await paymentFingerprint(prisma, booking.id)).toBe(original);
    expect(await prisma.financePaymentLink.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it('cobro anterior al corte de apertura se conserva pero no suma dinero dos veces', async () => {
    const bank = await account();
    const { payment } = await financePaymentFixture(prisma, fixture.actor, 400000, '2026-09-20T12:00:00Z');
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Histórico incluido en apertura' });
    const value = await report();
    expect(value.payments[0]).toMatchObject({ id: payment.id, amountMinor: 400000, includedInBalance: false });
    expect(value.totals).toMatchObject({ paymentsMinor: 400000, registeredBalanceMinor: 1000000 });
  });

  it('saldo de octubre incluye cobro de febrero posterior a apertura de enero sin contarlo como cobro del período', async () => {
    const bank = await execute({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco anual', opening: { amountMinor: 1000000, occurredAt: '2026-01-01T12:00:00Z', reason: 'Apertura enero' } });
    const { payment } = await financePaymentFixture(prisma, fixture.actor, 400000, '2026-02-01T12:00:00Z');
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Cobro de febrero' });
    const value = await repository.report(fixture.actor, { from: '2026-10-01', to: '2026-11-01' });
    expect(value.totals).toMatchObject({ paymentsMinor: 0, registeredBalanceMinor: 1400000 });
    expect(value.payments).toEqual([]);
    expect(value.movements).toEqual([]);
    expect(value.balanceSources.find(row => row.sourceType === 'PAYMENT')).toMatchObject({ sourceId: payment.id, amountMinor: 400000, includedInBalance: true });
    expect(value.balanceSources.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(1400000);
  });

  it('período IANA [from,to) de día DST de 23 horas incluye límites exactos una vez y aísla tenant', async () => {
    const business = await prisma.business.create({ data: { name: 'Finance DST QA', timezone: 'America/New_York', currency: 'PYG' } });
    await prisma.userBusinessMembership.create({ data: { userId: fixture.users.OWNER.id, businessId: business.id, role: 'OWNER' } });
    const actor = { businessId: business.id, actorUserId: fixture.users.OWNER.id };
    await financePaymentFixture(prisma, actor, 100000, '2026-03-08T04:59:59.999Z');
    const first = await financePaymentFixture(prisma, actor, 200000, '2026-03-08T05:00:00.000Z');
    const last = await financePaymentFixture(prisma, actor, 300000, '2026-03-09T03:59:59.999Z');
    await financePaymentFixture(prisma, actor, 400000, '2026-03-09T04:00:00.000Z');
    await financePaymentFixture(prisma, fixture.foreignActor, 900000, '2026-03-08T12:00:00Z');
    const value = await repository.report(actor, { from: '2026-03-08', to: '2026-03-09' });
    expect(value.timeZone).toBe('America/New_York');
    expect(value.totals).toMatchObject({ paymentsMinor: 500000, unassignedPaymentsMinor: 500000 });
    expect(new Set(value.payments.map(row => row.id))).toEqual(new Set([first.payment.id, last.payment.id]));
    expect(value.payments).toHaveLength(2);
  });

  it('dos actores asignando el mismo Payment producen un vínculo y un conflicto CAS', async () => {
    const bank = await account();
    const cash = await account(0, 'CASH');
    const { payment } = await financePaymentFixture(prisma, fixture.actor);
    const attempts = await Promise.allSettled([bank, cash].map(target => execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: target.id, expectedVersion: 0, reason: 'Cuenta informativa' })));
    expect(attempts.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(value => value.status === 'rejected')).toHaveLength(1);
    expect(await prisma.financePaymentLink.count()).toBe(1);
    expect((await report()).totals.registeredBalanceMinor).toBe(1400000);
  });

  it('cuenta sin apertura conserva saldo desconocido y exige corte explícito antes de movimiento', async () => {
    const created = await execute({ type: 'CREATE_ACCOUNT', name: 'Aún sin corte', kind: 'CASH', opening: null });
    await expect(execute({ type: 'CASH_MOVEMENT', accountId: created.id, kind: 'CONTRIBUTION', amountMinor: 400000, occurredAt: financeInstant, reason: 'Entrada conocida', openingId: null })).rejects.toBeInstanceOf(FinanceConflictError);
    const value = await report();
    expect(value.accounts[0]).toMatchObject({ id: created.id, balanceMinor: null });
    expect(value.totals.registeredBalanceMinor).toBeNull();
    expect(value.coverage.unconfiguredAccountIds).toEqual([created.id]);
    expect(await prisma.financeCashMovement.count()).toBe(0);
  });

  it('overflow de saldo positivo revierte aporte, auditoría y llave sin bloquear lecturas anteriores', async () => {
    const bank = await account(Number.MAX_SAFE_INTEGER);
    const key = randomUUID();
    const auditBefore = await prisma.financeAudit.count();
    await expect(execute({ type: 'CASH_MOVEMENT', accountId: bank.id, kind: 'CONTRIBUTION', amountMinor: 1, occurredAt: '2026-10-02T12:00:00Z', reason: 'Excede acumulado seguro', openingId: null }, key)).rejects.toThrow();
    expect(await prisma.financeCashMovement.count()).toBe(0);
    expect(await prisma.financeAudit.count()).toBe(auditBefore);
    expect(await prisma.financeRequest.count({ where: { idempotencyKey: key } })).toBe(0);
    expect((await report()).accounts[0].balanceMinor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('underflow de saldo negativo revierte retiro sin borrar apertura negativa conocida', async () => {
    const bank = await account(-Number.MAX_SAFE_INTEGER);
    await expect(execute({ type: 'CASH_MOVEMENT', accountId: bank.id, kind: 'WITHDRAWAL', amountMinor: 1, occurredAt: '2026-10-02T12:00:00Z', reason: 'Underflow acumulado', openingId: null })).rejects.toThrow();
    expect(await prisma.financeCashMovement.count()).toBe(0);
    expect((await report()).accounts[0]).toMatchObject({ balanceMinor: -Number.MAX_SAFE_INTEGER, negative: true });
  });

  it('transferencia que desborda destino conserva ambas cuentas y consolidado sin patas parciales', async () => {
    const bank = await account(1);
    const cash = await account(Number.MAX_SAFE_INTEGER - 1, 'CASH');
    await execute({ type: 'TRANSFER', fromAccountId: bank.id, toAccountId: cash.id, amountMinor: 1, occurredAt: '2026-10-02T12:00:00Z', reason: 'Límite válido' });
    await expect(execute({ type: 'TRANSFER', fromAccountId: bank.id, toAccountId: cash.id, amountMinor: 1, occurredAt: '2026-10-03T12:00:00Z', reason: 'Destino excedido' })).rejects.toThrow();
    expect(await prisma.financeTransfer.count()).toBe(1);
    const value = await report();
    expect(value.accounts.find(row => row.id === bank.id)?.balanceMinor).toBe(0);
    expect(value.accounts.find(row => row.id === cash.id)?.balanceMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(value.totals.registeredBalanceMinor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('sumar segundo gasto más allá de entero seguro revierte documento/líneas y preserva reporte', async () => {
    await execute(expenseCommand(fixture, Number.MAX_SAFE_INTEGER));
    await expect(execute(expenseCommand(fixture, 1))).rejects.toThrow();
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(await prisma.financeExpenseLine.count()).toBe(1);
    expect((await report()).totals).toMatchObject({ expenseMinor: Number.MAX_SAFE_INTEGER, operatingCostMinor: Number.MAX_SAFE_INTEGER, outstandingMinor: Number.MAX_SAFE_INTEGER });
  });

  it('arqueo995000 vs1000000 conserva diferencia-5000 y solo ajuste independiente cambia caja una vez', async () => {
    const cash = await account(1000000, 'CASH');
    const count = await execute({ type: 'COUNT_CASH', accountId: cash.id, occurredAt: '2026-10-02T12:00:00Z', countedAmountMinor: 995000, reason: 'Conteo físico sintético' });
    let value = await report();
    expect(value.cashCounts[0]).toMatchObject({ id: count.id, expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, adjustmentId: null });
    expect(value.totals.registeredBalanceMinor).toBe(1000000);
    const key = randomUUID();
    const command = { type: 'ADJUST_COUNT', id: count.id, expectedVersion: 1, reason: 'Diferencia explicada' } as const;
    await execute(command, key);
    await execute(command, key);
    value = await report();
    expect(value.totals.registeredBalanceMinor).toBe(995000);
    expect(value.cashCounts[0]).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, version: 2 });
    expect(value.cashCounts[0].adjustmentId).toEqual(expect.any(String));
    expect(await prisma.financeCashMovement.count()).toBe(1);
    await expect(execute({ ...command, expectedVersion: 1 })).rejects.toBeInstanceOf(FinanceConflictError);
  });

  it.each([0, 1])('dos arqueos del mismo corte: ajustar primero el #%i evita duplicar diferencia y permite un corte posterior', async winnerIndex => {
    const cash = await account(1000000, 'CASH');
    const cut = '2026-10-02T12:00:00Z';
    const countCommand: FinanceCommand = { type: 'COUNT_CASH', accountId: cash.id, occurredAt: cut, countedAmountMinor: 995000, reason: 'Dos conteos del mismo efectivo' };
    const counts = [await execute(countCommand), await execute(countCommand)];
    const initial = (await report()).cashCounts;
    expect(initial).toHaveLength(2);
    for (const count of initial) {
      expect(count).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, adjustmentId: null, version: 1 });
    }
    const winner = counts[winnerIndex];
    const loser = counts[1 - winnerIndex];
    const winnerKey = randomUUID();
    const winnerCommand: FinanceCommand = { type: 'ADJUST_COUNT', id: winner.id, expectedVersion: 1, reason: 'Diferencia de este corte explicada una vez' };
    const adjusted = await execute(winnerCommand, winnerKey);
    const committedCounts = {
      movement: await prisma.financeCashMovement.count(),
      audit: await prisma.financeAudit.count(),
      request: await prisma.financeRequest.count(),
    };
    expect(adjusted).toMatchObject({ id: winner.id, version: 2, type: 'ADJUST_COUNT' });
    expect(await execute(winnerCommand, winnerKey)).toEqual(adjusted);
    const loserKey = randomUUID();
    await expect(execute({ type: 'ADJUST_COUNT', id: loser.id, expectedVersion: 1, reason: 'Intento sobre diferencia ya ajustada' }, loserKey)).rejects.toBeInstanceOf(FinanceConflictError);
    expect(await prisma.financeCashMovement.count()).toBe(committedCounts.movement);
    expect(await prisma.financeAudit.count()).toBe(committedCounts.audit);
    expect(await prisma.financeRequest.count()).toBe(committedCounts.request);
    expect(await prisma.financeRequest.count({ where: { idempotencyKey: loserKey } })).toBe(0);
    const after = await report();
    expect(after.totals.registeredBalanceMinor).toBe(995000);
    expect(after.cashCounts.find(row => row.id === winner.id)).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, version: 2, adjustmentId: expect.any(String) });
    expect(after.cashCounts.find(row => row.id === loser.id)).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, version: 1, adjustmentId: null });
    const movements = await prisma.financeCashMovement.findMany({ where: { accountId: cash.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ kind: 'ADJUSTMENT', amountMinor: -5000n, occurredAt: new Date(cut) });
    const later = await execute({ type: 'COUNT_CASH', accountId: cash.id, occurredAt: '2026-10-03T12:00:00Z', countedAmountMinor: 994000, reason: 'Conteo posterior al corte ajustado' });
    expect((await report()).cashCounts.find(row => row.id === later.id)).toMatchObject({ expectedAmountMinor: 995000, countedAmountMinor: 994000, differenceMinor: -1000, adjustmentId: null });
    await execute({ type: 'ADJUST_COUNT', id: later.id, expectedVersion: 1, reason: 'Nueva diferencia del corte posterior' });
    expect((await report()).totals.registeredBalanceMinor).toBe(994000);
    expect(await prisma.financeCashMovement.count({ where: { accountId: cash.id } })).toBe(2);
  });

  it('dos ajustes concurrentes de arqueos distintos del mismo corte confirman una diferencia y revierten al perdedor', async () => {
    const cash = await account(1000000, 'CASH');
    const cut = '2026-10-02T12:00:00Z';
    const countCommand: FinanceCommand = { type: 'COUNT_CASH', accountId: cash.id, occurredAt: cut, countedAmountMinor: 995000, reason: 'Conteos concurrentes del mismo efectivo' };
    const counts = [await execute(countCommand), await execute(countCommand)];
    const keys = [randomUUID(), randomUUID()];
    const commands: FinanceCommand[] = counts.map(count => ({ type: 'ADJUST_COUNT', id: count.id, expectedVersion: 1, reason: 'Una sola diferencia del corte' }));
    const before = { audit: await prisma.financeAudit.count(), request: await prisma.financeRequest.count() };
    const attempts = await Promise.allSettled(commands.map((command, index) => execute(command, keys[index])));
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    const winnerIndex = attempts.findIndex(attempt => attempt.status === 'fulfilled');
    const loserIndex = 1 - winnerIndex;
    const winner = attempts[winnerIndex];
    const loser = attempts[loserIndex];
    if (winner.status !== 'fulfilled' || loser.status !== 'rejected') throw new Error('Se requiere un ganador y un conflicto reales.');
    expect(loser.reason).toBeInstanceOf(FinanceConflictError);
    expect(winner.value).toMatchObject({ id: counts[winnerIndex].id, version: 2, type: 'ADJUST_COUNT' });
    expect(await execute(commands[winnerIndex], keys[winnerIndex])).toEqual(winner.value);
    expect(await prisma.financeCashMovement.count({ where: { businessId: fixture.business.id, accountId: cash.id } })).toBe(1);
    expect(await prisma.financeAudit.count()).toBe(before.audit + 1);
    expect(await prisma.financeRequest.count()).toBe(before.request + 1);
    expect(await prisma.financeRequest.count({ where: { idempotencyKey: keys[loserIndex] } })).toBe(0);
    const snapshot = await report();
    expect(snapshot.totals.registeredBalanceMinor).toBe(995000);
    expect(snapshot.cashCounts.find(count => count.id === counts[winnerIndex].id)).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, version: 2, adjustmentId: expect.any(String) });
    expect(snapshot.cashCounts.find(count => count.id === counts[loserIndex].id)).toMatchObject({ expectedAmountMinor: 1000000, countedAmountMinor: 995000, differenceMinor: -5000, version: 1, adjustmentId: null });
    expect(await prisma.financeCashMovement.findFirstOrThrow({ where: { businessId: fixture.business.id, accountId: cash.id } })).toMatchObject({ amountMinor: -5000n, occurredAt: new Date(cut) });
  });

  it('revisión de cobro corregido queda obsoleta y CAS de revisión no pisa el estado', async () => {
    const bank = await account();
    const cash = await account(0, 'CASH');
    const { payment } = await financePaymentFixture(prisma, fixture.actor);
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Cobro banco' });
    const reviewed = { type: 'REVIEW_MOVEMENT', sourceType: 'PAYMENT', sourceId: payment.id, sourceVersion: 1, expectedVersion: 0, reviewed: true, reason: 'Verificación manual' } as const;
    await execute(reviewed);
    await expect(execute(reviewed)).rejects.toBeInstanceOf(FinanceConflictError);
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: cash.id, expectedVersion: 1, reason: 'Corregir cuenta' });
    const value = await report();
    expect(value.movements.find(row => row.sourceType === 'PAYMENT')).toMatchObject({ sourceVersion: 2, reviewed: false, reviewStale: true });
  });

  it('revisión por otro dueño crea versión y fecha coherentes; no-op exacto conserva responsable y fecha', async () => {
    const bank = await account();
    const { payment } = await financePaymentFixture(prisma, fixture.actor);
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Cobro verificado' });
    const firstCommand = { type: 'REVIEW_MOVEMENT', sourceType: 'PAYMENT', sourceId: payment.id, sourceVersion: 1, expectedVersion: 0, reviewed: true, reason: 'Primera revisión de soporte' } as const;
    const first = await execute(firstCommand);
    const originalDetails = (await report()).movements.find(row => row.sourceId === payment.id)!.reviewDetails;
    expect(originalDetails).toMatchObject({ actorUserId: fixture.actor.actorUserId, reason: firstCommand.reason, occurredAt: expect.any(String) });
    expect(new Date(originalDetails!.occurredAt).toISOString()).toBe(originalDetails!.occurredAt);
    const secondOwner = await prisma.user.create({ data: { email: `finance-owner-b-${randomUUID()}@top.test`, emailVerifiedAt: new Date('2026-01-01') } });
    await prisma.userBusinessMembership.create({ data: { userId: secondOwner.id, businessId: fixture.business.id, role: 'OWNER' } });
    const secondActor = { businessId: fixture.business.id, actorUserId: secondOwner.id };
    const secondCommand = { ...firstCommand, expectedVersion: 1, reason: 'Segunda revisión por otro dueño' };
    const second = await repository.execute(financeMutation(secondActor, secondCommand));
    expect(second).toMatchObject({ id: first.id, version: 2 });
    const changed = (await report()).movements.find(row => row.sourceId === payment.id)!;
    expect(changed).toMatchObject({ reviewVersion: 2, reviewed: true, reviewDetails: { actorUserId: secondOwner.id, reason: secondCommand.reason, occurredAt: expect.any(String) } });
    expect(changed.reviewDetails!.actorUserId).not.toBe(originalDetails!.actorUserId);
    const audits = await repository.audit(fixture.actor, 'PAYMENT', payment.id);
    const secondAudit = audits.find(row => row.actorUserId === secondOwner.id && row.action === 'REVIEW_MOVEMENT');
    expect(secondAudit).toBeDefined();
    expect(changed.reviewDetails!.occurredAt).toBe(secondAudit!.occurredAt);
    expect(new Date(changed.reviewDetails!.occurredAt).toISOString()).toBe(changed.reviewDetails!.occurredAt);
    expect(Date.parse(changed.reviewDetails!.occurredAt)).toBeGreaterThanOrEqual(Date.parse(originalDetails!.occurredAt));
    const noOp = await repository.execute(financeMutation(secondActor, { ...secondCommand, expectedVersion: 2 }));
    expect(noOp).toMatchObject({ id: first.id, version: 2 });
    const after = (await report()).movements.find(row => row.sourceId === payment.id)!;
    expect(after.reviewDetails).toEqual(changed.reviewDetails);
    expect(after.reviewVersion).toBe(2);
    expect((await report()).totals.registeredBalanceMinor).toBe(1400000);
  });

  it('no-op en transacción iniciada antes de la versión creadora conserva su metadata aunque audite después', async () => {
    const bank = await account();
    const { payment } = await financePaymentFixture(prisma, fixture.actor);
    await execute({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: bank.id, expectedVersion: 0, reason: 'Cobro para carrera de revisión' });
    const firstCommand = { type: 'REVIEW_MOVEMENT', sourceType: 'PAYMENT', sourceId: payment.id, sourceVersion: 1, expectedVersion: 0, reviewed: true, reason: 'Revisión original' } as const;
    const first = await execute(firstCommand);
    const secondOwner = await prisma.user.create({ data: { email: `finance-owner-interleave-${randomUUID()}@top.test`, emailVerifiedAt: new Date('2026-01-01') } });
    await prisma.userBusinessMembership.create({ data: { userId: secondOwner.id, businessId: fixture.business.id, role: 'OWNER' } });
    const secondActor = { businessId: fixture.business.id, actorUserId: secondOwner.id };
    const creatorCommand = { ...firstCommand, expectedVersion: 1, reason: 'Versión creadora por segundo dueño' };
    const noOpCommand = { ...creatorCommand, expectedVersion: 2 };
    const noOpStarted = createSignal<Date>();
    const releaseNoOp = createSignal<void>();
    const noOpKey = randomUUID();
    // La barrera controla el orden de inicio, sin sleeps ni resultados Prisma falsos.
    // El adaptador presta el mismo TransactionClient real al callback de producción.
    const noOp = prisma.$transaction(async (transaction) => {
      const [clock] = await transaction.$queryRaw<{ instant: Date }[]>`SELECT transaction_timestamp()::timestamp(3) AS instant`;
      if (!clock) throw new Error('No se pudo verificar el inicio de la transacción.');
      noOpStarted.resolve(clock.instant);
      await releaseNoOp.promise;
      const activeClient = { $transaction: (operation: (active: Prisma.TransactionClient) => Promise<FinanceResult>) => operation(transaction) } as unknown as PrismaClient;
      return new PrismaFinanceRepository(activeClient).execute(financeMutation(secondActor, noOpCommand, noOpKey));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
    try {
      const startedAt = await Promise.race([noOpStarted.promise, noOp.then(() => { throw new Error('El no-op terminó antes de liberar la barrera.'); })]);
      const creator = await repository.execute(financeMutation(secondActor, creatorCommand));
      expect(creator).toMatchObject({ id: first.id, version: 2 });
      const creatorAudit = await prisma.financeAudit.findFirstOrThrow({ where: { businessId: fixture.business.id, sourceId: first.id, action: 'REVIEW_MOVEMENT', details: { path: ['command', 'expectedVersion'], equals: 1 } } });
      expect(creatorAudit.occurredAt.getTime()).toBeGreaterThan(startedAt.getTime());
      const before = await report();
      const creatorDetails = before.movements.find(movement => movement.sourceId === payment.id)!.reviewDetails;
      expect(creatorDetails).toEqual({ actorUserId: secondOwner.id, occurredAt: creatorAudit.occurredAt.toISOString(), reason: creatorCommand.reason });
      releaseNoOp.resolve();
      expect(await noOp).toEqual(creator);
      const noOpAudit = await prisma.financeAudit.findFirstOrThrow({ where: { businessId: fixture.business.id, sourceId: first.id, action: 'REVIEW_MOVEMENT', details: { path: ['command', 'expectedVersion'], equals: 2 } } });
      // Prisma 6.19.3 materializa @default(now()) por request, no por inicio SQL.
      // La transacción comenzó antes del creador; esta auditoría real se emite después.
      // No demuestra un no-op con audit anterior al creador ni la necesidad del filtro SQL.
      expect(noOpAudit.occurredAt.getTime()).toBeGreaterThan(startedAt.getTime());
      expect(noOpAudit.occurredAt.getTime()).toBeGreaterThan(creatorAudit.occurredAt.getTime());
      expect(noOpAudit.details).toMatchObject({ command: { expectedVersion: 2 }, result: { id: first.id, version: 2 } });
      expect(await prisma.financeAudit.count({ where: { businessId: fixture.business.id, sourceId: first.id, action: 'REVIEW_MOVEMENT' } })).toBe(3);
      const after = await report();
      expect(after.movements.find(movement => movement.sourceId === payment.id)).toMatchObject({ reviewVersion: 2, reviewed: true, reviewDetails: creatorDetails });
      expect(after.token).toBe(before.token);
      expect(after.totals.registeredBalanceMinor).toBe(1400000);
      expect(await prisma.financeRequest.count({ where: { businessId: fixture.business.id, idempotencyKey: noOpKey } })).toBe(1);
      expect(await repository.execute(financeMutation(secondActor, noOpCommand, noOpKey))).toEqual(creator);
      expect(await prisma.financeAudit.count({ where: { businessId: fixture.business.id, sourceId: first.id, action: 'REVIEW_MOVEMENT' } })).toBe(3);
    } finally {
      releaseNoOp.resolve();
      await Promise.allSettled([noOp]);
    }
  });
});
