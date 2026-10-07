import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import type { FinanceActor } from '../domain/finance.types';
import type { CloseJson } from '../domain/finance-close.types';
import type { FinanceBookingResult, FinanceBookingResultQuery } from '../domain/finance-booking-result.types';
import type { CertifyServiceCommand, RecognitionContext, ServiceCertificate } from '../domain/finance-recognition.types';
import { planTerminalRecognition } from '../domain/finance-recognition.rules';
import { assertFinanceWriteOpen } from '../domain/finance-close.rules';
import { recognitionRequire, recognitionVersion } from '../domain/finance-recognition.support';
import { CertifyServiceUseCase, type RecognitionMutation, type RecognitionTransactionScope } from '../application/finance-recognition.use-cases';
import type { FinanceRecognitionOperations, FinanceTerminalRecognitionCommand, FinanceTerminalRecognitionResult, FinanceProfitabilityQuery, FinanceRecognitionSourceReport } from '../application/finance-recognition.operations';
import { parseFinanceIdempotencyKey, parseFinanceUuid } from '../domain/finance-validation';
import { FINANCE_RECOGNITION_PUBLIC_READERS, FINANCE_RECOGNITION_COST_READER, type FinanceRecognitionPublicReaders, type FinanceRecognitionCostReader } from './finance-recognition.readers';
import { authorizeRecognitionOwner, lockRecognitionBooking, lockRecognitionBusiness, recognitionHash, recognitionReadRequest, recognitionInsertRequest, recognitionInsertAudit, recognitionAsOf, recognitionLocalToday, recognitionJson, readRecognitionHead, readClosedRecognitionPeriods, recognitionAssertDatabaseOpen } from './finance-recognition.db';
import { mapServicePricingBasis, terminalRecognitionSourceHash } from './finance-recognition.source';
import { readFinanceRecognitionProjection } from './finance-recognition.report';
import { readFinanceRecognitionSources } from './finance-recognition.sources';
import { readFinanceBookingResult } from './finance-recognition-booking-result.reader';

@Injectable()
export class PrismaFinanceRecognitionRepository implements FinanceRecognitionOperations {
  constructor(private readonly prisma: PrismaService, @Inject(FINANCE_RECOGNITION_PUBLIC_READERS) private readonly readers: FinanceRecognitionPublicReaders, @Inject(FINANCE_RECOGNITION_COST_READER) private readonly costs: FinanceRecognitionCostReader) {}

  certifyService(actor: FinanceActor, command: CertifyServiceCommand, key: string): Promise<ServiceCertificate> {
    const principal = validateRecognitionActor(actor);
    const input: RecognitionMutation = { ...principal, command, idempotencyKey: parseFinanceIdempotencyKey(key), fingerprint: recognitionHash(command) };
    const clock = { value: '' };
    const useCase = new CertifyServiceUseCase({ execute: work => this.prisma.$transaction(tx => work(this.certificationScope(tx, clock)), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 }) }, { now: () => clock.value }, { next: () => randomUUID() });
    return useCase.execute(input);
  }

  recognizeTerminal(actor: FinanceActor, command: FinanceTerminalRecognitionCommand, key: string): Promise<FinanceTerminalRecognitionResult> {
    const principal = validateRecognitionActor(actor); const idempotencyKey = parseFinanceIdempotencyKey(key); const fingerprint = recognitionHash(command);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal);
      const prior = await recognitionReadRequest<FinanceTerminalRecognitionResult>(tx, principal, 'CONFIRM_TERMINAL_RECOGNITION', idempotencyKey);
      if (prior) { recognitionRequire(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'La clave pertenece a otra intención.'); return prior.result; }
      await lockRecognitionBooking(tx, principal.businessId, command.bookingId);
      const business = await lockRecognitionBusiness(tx, principal.businessId, false);
      const { evidence, pricing, versions, head, recordedAt, plan } = await this.readTerminalSources(tx, principal, command, business.timezone);
      const dates = [...(versions[0] ? [versions[0].recognitionOn.toISOString().slice(0, 10)] : []), plan.recognitionOn];
      const refs = versions[0] ? [{ type: 'TERMINAL_RECOGNITION', id: versions[0].id }] : [];
      assertFinanceWriteOpen({ businessId: principal.businessId, writer: 'TERMINAL_RECOGNITION', affectedDates: dates, changedSourceRefs: refs, complete: true }, await readClosedRecognitionPeriods(tx, principal.businessId));
      await recognitionAssertDatabaseOpen(tx, principal.businessId, dates, refs);
      const id = randomUUID(); const version = recognitionVersion(command.expectedVersion + 1, 1);
      const resourceId = evidence.resourceIds.length === 1 ? evidence.resourceIds[0] : null;
      const result: FinanceTerminalRecognitionResult = { id, businessId: principal.businessId, bookingId: command.bookingId, resourceId, version, pricingRevisionId: plan.terminalAdjustmentId, serviceCertificateId: head?.id ?? null, serviceCertificateVersion: head?.version ?? 0, terminalSourceHash: plan.terminalSourceHash, recognitionOn: plan.recognitionOn, finalAmountMinor: plan.finalAmountMinor, serviceAmountMinor: plan.serviceAmountMinor, amountMinor: plan.confirmedNonServiceAmountMinor, coverage: plan.coverage as 'COMPLETE' | 'DECLARED_NONE', classification: plan.classification.trim(), reason: plan.reason.trim(), recordedByUserId: principal.actorUserId, recordedAt };
      const requestId = await recognitionInsertRequest(tx, principal, 'CONFIRM_TERMINAL_RECOGNITION', idempotencyKey, fingerprint, result);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceTerminalRecognition"(id,"businessId","bookingId","resourceId",version,"pricingRevisionId","serviceCertificateId","serviceCertificateVersion","terminalSourceHash","recognitionOn","finalAmountMinor","serviceAmountMinor","amountMinor",coverage,classification,reason,"recordedByUserId","recordedAt","requestId") VALUES(${id},${principal.businessId},${command.bookingId},${resourceId},${version},${pricing.pricingRevisionId},${result.serviceCertificateId},${result.serviceCertificateVersion},${plan.terminalSourceHash},${plan.recognitionOn}::date,${BigInt(plan.finalAmountMinor)},${BigInt(plan.serviceAmountMinor)},${BigInt(plan.confirmedNonServiceAmountMinor)},${plan.coverage},${plan.classification.trim()},${plan.reason.trim()},${principal.actorUserId},${new Date(recordedAt)},${requestId})`);
      await recognitionInsertAudit(tx, principal, 'CONFIRM_TERMINAL_RECOGNITION', id, { command, result });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  }


  private async readTerminalSources(tx: Prisma.TransactionClient, principal: FinanceActor, command: FinanceTerminalRecognitionCommand, timeZone: string) {
      const evidence = await this.readers.evidence(tx, principal.businessId, command.bookingId);
      recognitionRequire(evidence && evidence.bookingUpdatedAt === command.expectedBookingUpdatedAt, 'SOURCE_VERSION_CONFLICT', 'La reserva cambió o no está disponible.');
      const pricing = await this.readers.currentPricing(tx, principal.businessId, command.bookingId);
      recognitionRequire(pricing && pricing.kind === 'TERMINAL_FINAL_AMOUNT' && pricing.pricingRevisionId === command.expectedPricingRevisionId && pricing.currency === 'PYG', 'TERMINAL_SOURCE_CONFLICT', 'El importe final vigente cambió o no fue confirmado.');
      const versions = await tx.$queryRaw<{ id: string; version: number; recognitionOn: Date }[]>(Prisma.sql`SELECT id,version,"recognitionOn" FROM "FinanceTerminalRecognition" WHERE "businessId"=${principal.businessId} AND "bookingId"=${command.bookingId} ORDER BY version DESC LIMIT 1`);
      recognitionRequire((versions[0]?.version ?? 0) === command.expectedVersion, 'TERMINAL_VERSION_CONFLICT', 'La confirmación terminal cambió.');
      const head = await readRecognitionHead(tx, principal.businessId, command.bookingId);
      const recordedAt = await recognitionAsOf(tx);
      const plan = planTerminalRecognition({ businessId: principal.businessId, bookingId: command.bookingId, bookingStatus: evidence.status as 'CANCELLED' | 'NO_SHOW', sourceKind: pricing.kind, terminalAdjustmentId: pricing.pricingRevisionId, terminalSourceHash: terminalRecognitionSourceHash(pricing), recognitionOn: command.recognitionOn, finalAmountMinor: pricing.totalAmountMinor, confirmedNonServiceAmountMinor: command.confirmedNonServiceAmountMinor, coverage: command.coverage, classification: command.classification, reason: command.reason, serviceCertificateId: command.serviceCertificateId, serviceCertificateVersion: command.serviceCertificateVersion }, head, recognitionLocalToday(new Date(recordedAt), timeZone));
      return { evidence, pricing, versions, head, recordedAt, plan };
  }
  profitability(actor: FinanceActor, query: FinanceProfitabilityQuery): Promise<CloseJson> {
    const principal = validateRecognitionActor(actor);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal);
      const business = await lockRecognitionBusiness(tx, principal.businessId, false, false);
      const report = await readFinanceRecognitionProjection(tx, principal, query, business.timezone, await recognitionAsOf(tx), this.readers, this.costs);
      return recognitionJson(report) as CloseJson;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
  recognitionSources(actor: FinanceActor, query: FinanceProfitabilityQuery): Promise<FinanceRecognitionSourceReport> {
    const principal = validateRecognitionActor(actor);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal);
      const business = await lockRecognitionBusiness(tx, principal.businessId, false, false);
      return readFinanceRecognitionSources(tx, principal, query, business.timezone, await recognitionAsOf(tx), this.readers);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }

  bookingResult(actor: FinanceActor, bookingId: string, query: FinanceBookingResultQuery): Promise<FinanceBookingResult> {
    const principal = validateRecognitionActor(actor); const id = parseFinanceUuid(bookingId);
    return this.prisma.$transaction(async tx => {
      await authorizeRecognitionOwner(tx, principal);
      const business = await lockRecognitionBusiness(tx, principal.businessId, false, false);
      return readFinanceBookingResult(tx, principal, id, query, business.timezone, await recognitionAsOf(tx), this.readers);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }

  private certificationScope(tx: Prisma.TransactionClient, clock: { value: string }): RecognitionTransactionScope {
    let timeZone = ''; let plannedRequestId = '';
    return {
      authorizeOwner: value => authorizeRecognitionOwner(tx, value),
      readRequest: async value => { const prior = await recognitionReadRequest<ServiceCertificate>(tx, value, 'CERTIFY_SERVICE', value.idempotencyKey); return prior ? { fingerprint: prior.fingerprint, certificate: prior.result } : null; },
      lockSources: async value => { await lockRecognitionBooking(tx, value.businessId, value.command.bookingId); timeZone = (await lockRecognitionBusiness(tx, value.businessId, false)).timezone; },
      readLockedContext: async value => {
        const evidence = await this.readers.evidence(tx, value.businessId, value.command.bookingId);
        recognitionRequire(evidence, 'SOURCE_NOT_FOUND', 'Reserva no disponible.');
        const source = value.command.servedNights.length ? await this.readers.servicePricing(tx, value.businessId, value.command.bookingId) : null;
        let pricing;
        if (value.command.servedNights.length === 0) {
          const head = await readRecognitionHead(tx, value.businessId, value.command.bookingId);
          recognitionRequire(head, 'CERTIFICATE_VERSION_CONFLICT', 'El reverso requiere un certificado vigente.');
          pricing = head.certificate.pricing;
        } else { recognitionRequire(source, 'SERVICE_SOURCE_CONFLICT', 'No hay precio SERVICE confirmado.'); pricing = mapServicePricingBasis(source); }
        recognitionRequire(!value.command.servedNights.length || (evidence.checkInDate !== null && evidence.checkOutDate !== null), 'SERVICE_SOURCE_CONFLICT', 'La reserva requiere estancia acordada completa.');
        clock.value = await recognitionAsOf(tx);
        return { booking: { ...evidence, checkInDate: evidence.checkInDate ?? pricing.checkInDate, checkOutDate: evidence.checkOutDate ?? pricing.checkOutDate }, pricing, localToday: recognitionLocalToday(new Date(clock.value), timeZone) } satisfies RecognitionContext;
      },
      readHead: value => readRecognitionHead(tx, value.businessId, value.command.bookingId),
      assertOpenImpact: async (value, previous, next) => {
        const dates = [...(previous?.units.map(unit => unit.localNight) ?? []), ...next.units.map(unit => unit.localNight)];
        const refs = previous ? [{ type: 'SERVICE_CERTIFICATE', id: previous.id }] : [];
        assertFinanceWriteOpen({ businessId: value.businessId, writer: 'SERVICE_CERTIFICATE', affectedDates: dates, changedSourceRefs: refs, complete: true }, await readClosedRecognitionPeriods(tx, value.businessId));
        await recognitionAssertDatabaseOpen(tx, value.businessId, dates, refs);
      },
      appendAndCompareHead: async (value, certificate, expectedVersion) => {
        plannedRequestId = await recognitionInsertRequest(tx, value, 'CERTIFY_SERVICE', value.idempotencyKey, value.fingerprint, certificate);
        await appendRecognitionCertificate(tx, value, certificate, plannedRequestId);
        const changed = expectedVersion === 0
          ? await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceServiceHead"(id,"businessId","bookingId",version,"certificateId") VALUES(${randomUUID()},${value.businessId},${certificate.bookingId},${certificate.version},${certificate.id}) ON CONFLICT("bookingId","businessId") DO NOTHING`)
          : await tx.$executeRaw(Prisma.sql`UPDATE "FinanceServiceHead" SET version=${certificate.version},"certificateId"=${certificate.id} WHERE "businessId"=${value.businessId} AND "bookingId"=${certificate.bookingId} AND version=${expectedVersion} AND "certificateId"=${certificate.supersedesCertificateId}`);
        recognitionRequire(changed === 1, 'CERTIFICATE_VERSION_CONFLICT', 'El head cambió durante la certificación.');
      },
      appendAuditAndRequest: async (value, certificate) => { recognitionRequire(plannedRequestId.length > 0, 'REQUEST_STATE_CONFLICT', 'No se reservó la intención financiera.'); await recognitionInsertAudit(tx, value, 'CERTIFY_SERVICE', certificate.id, { command: value.command, result: certificate }); },
    };
  }
}
export function validateRecognitionActor(actor: FinanceActor): FinanceActor { return { businessId: parseFinanceUuid(actor.businessId), actorUserId: parseFinanceUuid(actor.actorUserId) }; }
async function appendRecognitionCertificate(tx: Prisma.TransactionClient, actor: FinanceActor, certificate: ServiceCertificate, requestId: string): Promise<void> {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceServiceCertificate"(id,"businessId","bookingId","resourceId",version,"supersedesCertificateId","originalSnapshotId","serviceRevisionId","sourceHash","bookingUpdatedAt","effectiveCheckInOn","effectiveCheckOutOn","checkInEventId","checkOutEventId",pricing,"policyVersion","servicePolicyVersion",evidence,reason,"recordedByUserId","recordedAt","requestId") VALUES(${certificate.id},${actor.businessId},${certificate.bookingId},${certificate.resourceId},${certificate.version},${certificate.supersedesCertificateId},${certificate.pricing.originalSnapshotId},${certificate.pricing.serviceRevisionId},${certificate.pricing.sourceHash},${new Date(certificate.bookingUpdatedAt)},${certificate.effectiveCheckInOn}::date,${certificate.effectiveCheckOutOn}::date,${certificate.checkInEventId},${certificate.checkOutEventId},${JSON.stringify(recognitionJson(certificate.pricing))}::jsonb,${certificate.policyVersion},${certificate.servicePolicyVersion},${certificate.evidence},${certificate.reason},${actor.actorUserId},${new Date(certificate.recordedAt)},${requestId})`);
  if (certificate.units.length > 0) await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceServiceUnit"(id,"businessId","bookingId","certificateId","localNight","amountMinor") VALUES ${Prisma.join(certificate.units.map(unit => Prisma.sql`(${randomUUID()},${actor.businessId},${certificate.bookingId},${certificate.id},${unit.localNight}::date,${BigInt(unit.amountMinor)})`))}`);
}
