import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { readFinanceGuardedWriters } from '../../../shared/infrastructure/finance-period.guard';
import type { FinanceActor } from '../domain/finance.types';
import type { CloseJson, FinanceCloseSources, FinanceCloseSnapshot, FinancePeriod, FinancialSourceRef } from '../domain/finance-close.types';
import { assertMonthlyPeriod } from '../domain/finance-close.rules';
import { recognitionRequire, recognitionText } from '../domain/finance-recognition.support';
import type { FinanceCloseOperations, FinanceCreatePeriodCommand, FinanceClosePeriodCommand, FinanceReopenPeriodCommand, FinanceCloseAcknowledgements } from '../application/finance-close.operations';
import { FinanceCloseUseCase, type CloseMutation, type CloseResult, type CloseTransactionScope } from '../application/finance-close.use-cases';
import { buildFinanceClosePackage, type FinanceClosePackage } from '../application/finance-close.package';
import { parseFinanceIdempotencyKey, parseFinanceUuid } from '../domain/finance-validation';
import { FINANCE_RECOGNITION_PUBLIC_READERS, FINANCE_RECOGNITION_COST_READER, FINANCE_CLOSE_SUPPLEMENT_READER, type FinanceRecognitionPublicReaders, type FinanceRecognitionCostReader, type FinanceCloseSupplementReader } from './finance-recognition.readers';
import { authorizeRecognitionOwner, lockRecognitionBusiness, recognitionHash, recognitionReadRequest, recognitionInsertRequest, recognitionInsertAudit, recognitionAsOf, recognitionLocalToday, recognitionJson, mapRecognitionPeriod, type RecognitionPeriodRow } from './finance-recognition.db';
import { readFinanceRecognitionProjection } from './finance-recognition.report';
import { validateRecognitionActor } from './finance-recognition.repository';
import { loadFinanceSources } from './finance-report.loader';
import { mapFinanceReport } from './finance-report.mapper';

@Injectable()
export class PrismaFinanceCloseRepository implements FinanceCloseOperations {
  constructor(private readonly prisma: PrismaService, @Inject(FINANCE_RECOGNITION_PUBLIC_READERS) private readonly readers: FinanceRecognitionPublicReaders, @Inject(FINANCE_RECOGNITION_COST_READER) private readonly costs: FinanceRecognitionCostReader, @Inject(FINANCE_CLOSE_SUPPLEMENT_READER) private readonly supplement: FinanceCloseSupplementReader) {}
  listPeriods(actor: FinanceActor): Promise<FinancePeriod[]> {
    const principal = validateRecognitionActor(actor);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal); await lockRecognitionBusiness(tx, principal.businessId, false, false);
      const rows = await tx.$queryRaw<RecognitionPeriodRow[]>(Prisma.sql`SELECT * FROM "FinancePeriod" WHERE "businessId"=${principal.businessId} ORDER BY "from" DESC LIMIT 5001`);
      recognitionRequire(rows.length <= 5000, 'SOURCE_LIMIT', 'El listado no trunca períodos.'); return rows.map(mapRecognitionPeriod);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
  createPeriod(actor: FinanceActor, command: FinanceCreatePeriodCommand, key: string): Promise<FinancePeriod> {
    const principal = validateRecognitionActor(actor); recognitionText(command.reason); const idempotencyKey = parseFinanceIdempotencyKey(key); const fingerprint = recognitionHash(command);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal);
      const prior = await recognitionReadRequest<FinancePeriod>(tx, principal, 'CREATE_FINANCE_PERIOD', idempotencyKey);
      if (prior) { recognitionRequire(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'La clave pertenece a otra intención.'); return prior.result; }
      const business = await lockRecognitionBusiness(tx, principal.businessId, true);
      // Valida topología mensual; un período abierto puede prepararse cuando el mes termina.
      const period: FinancePeriod = { id: randomUUID(), businessId: principal.businessId, from: command.from, to: command.to, timeZone: business.timezone, status: 'OPEN', version: 1, latestSnapshotId: null };
      assertMonthlyPeriod(period, command.to);
      const exists = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "FinancePeriod" WHERE "businessId"=${principal.businessId} AND "from"=${command.from}::date AND "to"=${command.to}::date`);
      recognitionRequire(exists.length === 0, 'PERIOD_ALREADY_EXISTS_CONFLICT', 'El período mensual ya existe.');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "FinancePeriod"(id,"businessId","from","to","timeZone",status,version,"createdAt") VALUES(${period.id},${principal.businessId},${period.from}::date,${period.to}::date,${period.timeZone},'OPEN',1,clock_timestamp())`);
      await recognitionInsertRequest(tx, principal, 'CREATE_FINANCE_PERIOD', idempotencyKey, fingerprint, period);
      await recognitionInsertAudit(tx, principal, 'CREATE_FINANCE_PERIOD', period.id, { command, result: period });
      return period;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  }
  prepareClose(actor: FinanceActor, periodId: string): Promise<FinanceCloseSources> {
    const principal = validateRecognitionActor(actor); parseFinanceUuid(periodId);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal); const business = await lockRecognitionBusiness(tx, principal.businessId, false, false);
      const period = await this.readPeriod(tx, principal.businessId, periodId);
      return this.collectSources(tx, principal, period, business.timezone, {});
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
  readSnapshot(actor: FinanceActor, periodId: string, snapshotId?: string): Promise<FinanceCloseSnapshot> {
    const principal = validateRecognitionActor(actor); parseFinanceUuid(periodId); if (snapshotId !== undefined) parseFinanceUuid(snapshotId);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal); await lockRecognitionBusiness(tx, principal.businessId, false, false);
      const period = await this.readPeriod(tx, principal.businessId, periodId); const selectedId = snapshotId ?? period.latestSnapshotId;
      recognitionRequire(selectedId, 'SOURCE_NOT_FOUND', 'El período aún no tiene un paquete cerrado.');
      const rows = await tx.$queryRaw<FinanceCloseSnapshotDbRow[]>(Prisma.sql`SELECT * FROM "FinanceCloseSnapshot" WHERE id=${selectedId} AND "businessId"=${principal.businessId} AND "periodId"=${periodId}`);
      recognitionRequire(rows[0], 'SOURCE_NOT_FOUND', 'Snapshot no disponible en este período y Negocio.');
      return mapFinanceCloseSnapshot(rows[0]);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
  closePeriod(actor: FinanceActor, periodId: string, command: FinanceClosePeriodCommand, key: string): Promise<CloseResult> {
    return this.mutatePeriod(actor, periodId, 'CLOSE', command.expectedVersion, command.reason, key, command.expectedSourceToken, command.acknowledgements);
  }
  async readPackage(actor: FinanceActor, periodId: string, snapshotId?: string): Promise<FinanceClosePackage> {
    return buildFinanceClosePackage(await this.readSnapshot(actor, periodId, snapshotId));
  }
  reopenPeriod(actor: FinanceActor, periodId: string, command: FinanceReopenPeriodCommand, key: string): Promise<CloseResult> {
    return this.mutatePeriod(actor, periodId, 'REOPEN', command.expectedVersion, command.reason, key, '', {});
  }
  private mutatePeriod(actor: FinanceActor, periodId: string, operation: 'CLOSE' | 'REOPEN', expectedVersion: number, reason: string, key: string, token: string, acknowledgements: FinanceCloseAcknowledgements): Promise<CloseResult> {
    const principal = validateRecognitionActor(actor); const id = parseFinanceUuid(periodId); const clock = { value: '' };
    const input: CloseMutation = { ...principal, periodId: id, operation, expectedVersion, reason, idempotencyKey: parseFinanceIdempotencyKey(key), fingerprint: recognitionHash({ periodId: id, operation, expectedVersion, reason, token, acknowledgements }), expectedSourceToken: token };
    const useCase = new FinanceCloseUseCase({ execute: work => this.prisma.$transaction(tx => work(this.periodScope(tx, acknowledgements, clock)), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 }) }, { now: () => clock.value }, { next: () => randomUUID() });
    return useCase.execute(input);
  }
  private periodScope(tx: Prisma.TransactionClient, acknowledgements: FinanceCloseAcknowledgements, clock: { value: string }): CloseTransactionScope {
    let timeZone = '';
    return {
      authorizeOwner: value => authorizeRecognitionOwner(tx, value),
      readRequest: value => recognitionReadRequest<CloseResult>(tx, value, value.operation === 'CLOSE' ? 'CLOSE_FINANCE_PERIOD' : 'REOPEN_FINANCE_PERIOD', value.idempotencyKey),
      lockPeriod: async value => { timeZone = (await lockRecognitionBusiness(tx, value.businessId, true)).timezone; const period = await this.readPeriod(tx, value.businessId, value.periodId, true); clock.value = await recognitionAsOf(tx); return period; },
      localToday: () => Promise.resolve(recognitionLocalToday(new Date(clock.value), timeZone)),
      readCompleteSources: async (value, period) => { const sources = await this.collectSources(tx, value, period, timeZone, acknowledgements); clock.value = await recognitionAsOf(tx); return sources; },
      appendAndComparePeriod: async (value, result) => {
        const operation = value.operation === 'CLOSE' ? 'CLOSE_FINANCE_PERIOD' : 'REOPEN_FINANCE_PERIOD';
        const requestId = await recognitionInsertRequest(tx, value, operation, value.idempotencyKey, value.fingerprint, result);
        const snapshot = result.snapshot;
        if (snapshot) await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceCloseSnapshot"(id,"businessId","periodId","closeVersion","previousSnapshotId","asOf","sourceToken","policyVersion","policyVersions",payload,"payloadHash","sourceRefs",checklist,"recordedByUserId","recordedAt") VALUES(${snapshot.id},${value.businessId},${value.periodId},${snapshot.closeVersion},${snapshot.previousSnapshotId},${new Date(snapshot.asOf)},${snapshot.sourceToken},${snapshot.policyVersion},${JSON.stringify(recognitionJson(snapshot.policyVersions))}::jsonb,${JSON.stringify(recognitionJson(snapshot.payload))}::jsonb,${snapshot.payloadHash},${JSON.stringify(recognitionJson(snapshot.sourceRefs))}::jsonb,${JSON.stringify(recognitionJson(snapshot.checklist))}::jsonb,${value.actorUserId},${new Date(snapshot.recordedAt)})`);
        const changed = await tx.$executeRaw(Prisma.sql`UPDATE "FinancePeriod" SET status=${result.period.status},version=${result.period.version},"latestSnapshotId"=${result.period.latestSnapshotId} WHERE id=${value.periodId} AND "businessId"=${value.businessId} AND version=${value.expectedVersion} AND status=${value.operation === 'CLOSE' ? 'OPEN' : 'CLOSED'}`);
        recognitionRequire(changed === 1, 'CLOSE_VERSION_CONFLICT', 'El período cambió durante la operación.');
        const event = result.event;
        await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceCloseEvent"(id,"businessId","periodId",type,"beforeVersion","afterVersion","snapshotId",reason,"actorUserId","occurredAt","requestId") VALUES(${event.id},${value.businessId},${value.periodId},${event.type},${event.beforeVersion},${event.afterVersion},${event.snapshotId},${event.reason},${value.actorUserId},${new Date(event.occurredAt)},${requestId})`);
        await recognitionInsertAudit(tx, value, operation, value.periodId, { result });
      },
    };
  }
  private async readPeriod(tx: Prisma.TransactionClient, businessId: string, periodId: string, mutable = false): Promise<FinancePeriod> {
    const lock = mutable ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await tx.$queryRaw<RecognitionPeriodRow[]>(Prisma.sql`SELECT * FROM "FinancePeriod" WHERE id=${periodId} AND "businessId"=${businessId} ${lock}`);
    recognitionRequire(rows[0], 'SOURCE_NOT_FOUND', 'Período no disponible.'); return mapRecognitionPeriod(rows[0]);
  }
  private async collectSources(tx: Prisma.TransactionClient, actor: FinanceActor, period: FinancePeriod, timeZone: string, acknowledgements: FinanceCloseAcknowledgements): Promise<FinanceCloseSources> {
    const asOf = await recognitionAsOf(tx);
    recognitionRequire(period.timeZone === timeZone, 'TIME_ZONE_CONFLICT', 'El período conserva una timezone distinta.');
    assertMonthlyPeriod(period, recognitionLocalToday(new Date(asOf), timeZone));
    const [registeredSources, profitability, guardedWriters, supplement] = await Promise.all([
      loadFinanceSources(tx, actor.businessId, period.from, period.to, timeZone),
      readFinanceRecognitionProjection(tx, actor, { from: period.from, to: period.to }, timeZone, asOf, this.readers, this.costs),
      readFinanceGuardedWriters(tx),
      this.supplement.read(tx, { businessId: actor.businessId, from: period.from, to: period.to, asOf }),
    ]);
    recognitionRequire(Number.isSafeInteger(supplement.sourceCount) && supplement.sourceCount >= 0 && supplement.sourceCount <= 5000 && /^[a-f0-9]{64}$/.test(supplement.sourceToken), 'CLOSE_SUPPLEMENT_CONFLICT', 'El suplemento debe conservar token y límites completos.');
    const registered = mapFinanceReport(actor, { from: period.from, to: period.to }, timeZone, registeredSources, new Date(asOf));
    const payload = recognitionJson({ registeredOperations: registered, profitability, supplement: supplement.payload, missingSources: supplement.missingSources, debtBasis: 'OBSERVED_AT_AS_OF', unknownHistoricalDebt: true }) as CloseJson;
    const cut = registeredSources.bounds.to;
    const relevantPayments = registeredSources.payments.filter(payment => new Date(payment.paidAt) < cut);
    const relevantPaymentIds = new Set(relevantPayments.map(payment => payment.id));
    const relevantMovements = [...registered.balanceSources, ...registered.movements];
    const relevantMovementKeys = new Set(relevantMovements.map(row => `${row.sourceType}:${row.sourceId}`));
    const relevantAccountIds = new Set(relevantMovements.map(row => row.accountId));
    const sourceRefs: FinancialSourceRef[] = [
      ...profitability.sourceRefs,
      ...registered.expenses.flatMap(expense => [{ type: 'EXPENSE', id: expense.id, version: String(expense.version) }, ...expense.lines.map(line => ({ type: 'EXPENSE_LINE', id: line.id, version: String(expense.version) }))]),
      ...registered.payments.map(payment => ({ type: 'PAYMENT', id: payment.id, version: String(payment.version) })),
      ...relevantPayments.map(payment => ({ type: 'PAYMENT', id: payment.id, version: recognitionHash(payment) })),
      ...registered.catalogs.map(catalog => ({ type: 'CATALOG', id: catalog.id, version: String(catalog.version) })),
      ...registered.accounts.filter(account => relevantAccountIds.has(account.id) || account.opening && new Date(account.opening.occurredAt) < cut).map(account => ({ type: 'ACCOUNT', id: account.id, version: String(account.version) })),
      ...registered.accounts.flatMap(account => account.opening && new Date(account.opening.occurredAt) < cut ? [{ type: 'ACCOUNT_OPENING', id: account.opening.id, version: '1' }] : []),
      ...registeredSources.settlements.map(row => ({ type: 'SETTLEMENT', id: row.id, version: '1' })),
      ...registeredSources.links.filter(row => relevantPaymentIds.has(row.paymentId)).map(row => ({ type: 'PAYMENT_ACCOUNT_LINK', id: row.id, version: String(row.version) })),
      ...registeredSources.transfers.map(row => ({ type: 'TRANSFER', id: row.id, version: '1' })),
      ...registeredSources.cashMovements.map(row => ({ type: 'CASH_MOVEMENT', id: row.id, version: '1' })),
      ...registeredSources.cashCounts.map(row => ({ type: 'CASH_COUNT', id: row.id, version: String(row.version) })),
      ...registeredSources.reviews.filter(row => relevantMovementKeys.has(`${row.sourceType}:${row.sourceId}`)).map(row => ({ type: 'MOVEMENT_REVIEW', id: row.id, version: String(row.version) })),
      ...registered.resources.map(row => ({ type: 'RESOURCE', id: row.id, version: recognitionHash(row) })),
      // El suplemento del propietario aporta referencias canónicas, filtradas por impacto de período.
      ...supplement.sourceRefs,
    ];
    const uniqueRefs = [...new Map(sourceRefs.map(source => [`${source.type}:${source.id}`, source])).values()].sort((left, right) => `${left.type}:${left.id}` < `${right.type}:${right.id}` ? -1 : 1);
    recognitionRequire(uniqueRefs.length <= 5000 && supplement.sourceCount + profitability.sourceCount + registered.balanceSources.length + registered.expenses.reduce((sum, expense) => sum + 1 + expense.lines.length + expense.settlements.length, 0) <= 5000, 'SOURCE_LIMIT', 'El cierre completo excede 5000 fuentes; no se cierra truncado.');
    const sourcesComplete = supplement.complete && supplement.missingSources.length === 0;
    const conditions = { RECOGNITION_COVERAGE: profitability.coverage.complete, ACCOUNT_OPENINGS: registered.accounts.length > 0 && registered.coverage.unconfiguredAccountIds.length === 0, EVIDENCE: registered.coverage.missingEvidenceExpenseIds.length === 0, MOVEMENT_REVIEW: registered.movements.every(row => row.reviewed && !row.reviewStale), CASH_COUNTS: registered.cashCounts.every(row => row.differenceMinor === 0) };
    const checklist = [
      ...['SOURCES_COMPLETE', 'COMMON_CUT', 'PYG_SAFE', 'COST_CONSERVATION'].map(key => ({ key, passed: key === 'SOURCES_COMPLETE' ? sourcesComplete : true, severity: 'BLOCKER' as const, acknowledgement: null })),
      ...Object.entries(conditions).map(([key, passed]) => ({ key, passed, severity: 'EXCEPTION' as const, acknowledgement: acknowledgements[key as keyof FinanceCloseAcknowledgements] ?? null })),
    ];
    const sourceToken = recognitionHash({ periodId: period.id, from: period.from, to: period.to, timeZone, registeredToken: registered.token, profitabilityToken: profitability.token, supplementToken: supplement.sourceToken, sourcesComplete, sourceRefs: uniqueRefs, conditions, guardedWriters: [...guardedWriters].sort() });
    return { businessId: actor.businessId, from: period.from, to: period.to, timeZone, asOf, sourceToken, payload, payloadHash: recognitionHash(payload), sourceRefs: uniqueRefs, policyVersions: { service: 'NIGHT_SERVICE_V1', close: 'BLOCK_CLOSED_PERIOD_V1', allocation: 'EXPLICIT_VERSIONED_ALLOCATION' }, checklist, guardedWriters };
  }
}
type FinanceCloseSnapshotDbRow = Omit<FinanceCloseSnapshot, 'asOf' | 'recordedAt'> & { asOf: Date; recordedAt: Date };
export function mapFinanceCloseSnapshot(row: FinanceCloseSnapshotDbRow): FinanceCloseSnapshot {
  recognitionRequire(row.policyVersion === 'BLOCK_CLOSED_PERIOD_V1' && recognitionHash(row.payload) === row.payloadHash, 'CLOSE_SNAPSHOT_CONFLICT', 'El paquete cerrado no conserva su hash y política inmutables.');
  return { ...row, asOf: row.asOf.toISOString(), recordedAt: row.recordedAt.toISOString() };
}
