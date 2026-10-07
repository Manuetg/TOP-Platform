import { Prisma } from '@prisma/client';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceProfitabilityQuery } from '../application/finance-recognition.operations';
import type { FinancialSourceRef } from '../domain/finance-close.types';
import type { RecognitionProjectionUnit } from '../domain/finance-recognition.types';
import { projectResourceProfitability } from '../domain/finance-recognition.projection';
import { recognitionRequire, recognitionSafe, recognitionStay } from '../domain/finance-recognition.support';
import { parseFinanceQuery } from '../domain/finance-validation';
import { recognitionHash, recognitionLocalToday, type RecognitionCertificateRow } from './finance-recognition.db';
import type { FinanceRecognitionCostReader, FinanceRecognitionPublicReaders } from './finance-recognition.readers';
import { terminalRecognitionSourceHash } from './finance-recognition.source';

export interface FinanceRecognitionTerminalRow {
  id: string; bookingId: string; resourceId: string | null; version: number; pricingRevisionId: string;
  serviceCertificateId: string | null; serviceCertificateVersion: number; terminalSourceHash: string;
  recognitionOn: Date; amountMinor: bigint; finalAmountMinor: bigint; serviceAmountMinor: bigint;
  coverage: string; classification: string; reason: string; recordedAt: Date;
}
export async function readFinanceRecognitionProjection(tx: Prisma.TransactionClient, actor: FinanceActor, query: FinanceProfitabilityQuery, timeZone: string, asOf: string, readers: FinanceRecognitionPublicReaders, costs: FinanceRecognitionCostReader): Promise<ReturnType<typeof projectRecognitionReport>> {
  const range = parseFinanceQuery(query.from, query.to); const limit = 5000;
  const state = await loadRecognitionProjectionSources(tx, actor, range, asOf, readers, costs, limit);
  const coverage = collectRecognitionCoverage(state, actor, range, asOf, timeZone, limit);
  return projectRecognitionReport({ ...state, ...coverage, actor, range, query, timeZone, asOf, limit });
}

function projectRecognitionReport(input: ProjectionSources & ProjectionCoverage & { actor: FinanceActor; range: ReturnType<typeof parseFinanceQuery>; query: FinanceProfitabilityQuery; timeZone: string; asOf: string; limit: number }) {
  const { certificates, unitRows, byId, allTerminalRows, terminalRows, currentPrices, servicePrices, evidence, resources, costRead, sourceCount, pendingByReason, pendingServiceNights, actor, range, query, timeZone, asOf, limit } = input;
  const addPending = (reason: string, count = 1) => { pendingByReason[reason] = (pendingByReason[reason] ?? 0) + count; };
  const units: RecognitionProjectionUnit[] = unitRows.map(row => {
    const certificate = byId.get(row.certificateId);
    recognitionRequire(certificate && certificate.bookingId === row.bookingId, 'SOURCE_SCOPE_CONFLICT', 'La unidad no pertenece al certificado efectivo.');
    return { certificateId: certificate.id, certificateVersion: certificate.version, bookingId: row.bookingId, resourceId: certificate.resourceId, localNight: row.localNight.toISOString().slice(0, 10), amountMinor: recognitionSafe(row.amountMinor) };
  });
  const allTerminalEntries = allTerminalRows.map(row => mapTerminalEntry(row, input, addPending));
  const terminalEntries = allTerminalEntries.filter(row => row.recognitionOn >= range.from && row.recognitionOn < range.to);
  if (costRead.coverage.unknownSourceIds.length) addPending('COST_SOURCE_UNKNOWN', costRead.coverage.unknownSourceIds.length);
  if (costRead.coverage.missingEvidenceSourceIds.length) addPending('COST_EVIDENCE_MISSING', costRead.coverage.missingEvidenceSourceIds.length);
  for (const reason of costRead.coverage.unsupportedReasons ?? []) addPending(reason);
  const result = projectResourceProfitability({ ...range, resourceIds: resources.map(row => row.id), units, terminalEntries, costSources: costRead.costSources, coverage: { complete: Object.keys(pendingByReason).length === 0, pendingByReason } });
  const afterOwnerWork = projectResourceProfitability({ ...range, resourceIds: resources.map(row => row.id), units, terminalEntries, costSources: [...costRead.costSources, ...costRead.ownerWorkSources], coverage: result.coverage });
  const usedCertificateIds = new Set(units.map(unit => unit.certificateId));
  const serviceSources = [...servicePrices.values()].filter(price => {
    const context = price.sourceContext;
    return context !== null && typeof context === 'object' && !Array.isArray(context) && typeof context.checkInDate === 'string' && typeof context.checkOutDate === 'string' && context.checkInDate < range.to && context.checkOutDate > range.from;
  });
  const usedBookingIds = new Set([...units.map(unit => unit.bookingId), ...terminalRows.map(row => row.bookingId), ...serviceSources.map(price => price.bookingId)]);
  const sourceRefs: FinancialSourceRef[] = [
    ...[...usedBookingIds].map(id => ({ type: 'BOOKING', id, version: evidence.get(id)?.bookingUpdatedAt ?? 'MISSING' })),
    ...serviceSources.map(price => ({ type: 'SERVICE_PRICING', id: price.id, version: recognitionHash({ kind: price.kind, id: price.id, originalSnapshotId: price.originalSnapshotId, pricingRevisionId: price.pricingRevisionId, revisionNumber: price.revisionNumber, currency: price.currency, totalAmountMinor: price.totalAmountMinor, items: price.items, sourceContext: price.sourceContext }) })),
    ...certificates.filter(row => usedCertificateIds.has(row.id)).flatMap(row => [{ type: 'SERVICE_CERTIFICATE', id: row.id, version: String(row.version) }, { type: 'SERVICE_PRICING', id: (row.pricing as unknown as { sourceId: string }).sourceId, version: (row.pricing as unknown as { sourceHash: string }).sourceHash }]),
    ...terminalRows.flatMap(row => [{ type: 'TERMINAL_RECOGNITION', id: row.id, version: String(row.version) }, { type: 'TERMINAL_PRICING', id: row.pricingRevisionId, version: row.terminalSourceHash }]),
    ...costRead.costSources.concat(costRead.ownerWorkSources).map(source => ({ type: source.sourceId.startsWith('EXPENSE_LINE:') ? 'EXPENSE_LINE' : 'LABOR_REVISION', id: source.sourceId.slice(source.sourceId.indexOf(':') + 1), version: String(source.sourceVersion) })),
  ];
  const uniqueRefs = [...new Map(sourceRefs.map(source => [`${source.type}:${source.id}`, source])).values()].sort((left, right) => `${left.type}:${left.id}` < `${right.type}:${right.id}` ? -1 : 1);
  const pricingSources = [...currentPrices.values()].sort((left, right) => left.bookingId < right.bookingId ? -1 : 1);
  const token = recognitionHash({ businessId: actor.businessId, ...range, timeZone, units, certificates: certificates.map(row => ({ id: row.id, version: row.version, pricing: row.pricing, evidence: row.evidence, reason: row.reason })), allTerminalRows, resources, pricingSources, costToken: costRead.token, sourceRefs: uniqueRefs, coverage: result.coverage });
  recognitionRequire(query.expectedSourceToken === undefined || query.expectedSourceToken === token, 'SOURCE_TOKEN_CONFLICT', 'La consulta cambió; actualiza antes de continuar.');
  const serviceCertificates = certificates.map(row => ({ id: row.id, businessId: row.businessId, bookingId: row.bookingId, resourceId: row.resourceId, version: row.version, supersedesCertificateId: row.supersedesCertificateId, originalSnapshotId: row.originalSnapshotId, serviceRevisionId: row.serviceRevisionId, sourceHash: row.sourceHash, pricing: row.pricing, policyVersion: row.policyVersion, servicePolicyVersion: row.servicePolicyVersion, bookingUpdatedAt: row.bookingUpdatedAt.toISOString(), effectiveCheckInOn: row.effectiveCheckInOn.toISOString().slice(0, 10), effectiveCheckOutOn: row.effectiveCheckOutOn?.toISOString().slice(0, 10) ?? null, checkInEventId: row.checkInEventId, checkOutEventId: row.checkOutEventId, evidence: row.evidence, reason: row.reason, recordedByUserId: row.recordedByUserId, recordedAt: row.recordedAt.toISOString() }));
  return { businessId: actor.businessId, ...range, timeZone, currency: 'PYG' as const, basis: 'CERTIFIED_SERVICE' as const, asOf, token, sourceLimit: limit, sourceCount: sourceCount + pendingServiceNights.length, resources: resources.map(row => ({ id: row.id, name: row.name, active: row.status === 'ACTIVE' })), units, serviceCertificates, pendingServiceNights, terminalEntries, terminalRecognitionSources: allTerminalEntries, pricingSources, costSources: costRead.costSources, ownerWorkSources: costRead.ownerWorkSources, ...result, afterOwnerWork: { rows: afterOwnerWork.rows, totals: afterOwnerWork.totals }, sourceRefs: uniqueRefs };
}

async function loadRecognitionProjectionSources(tx: Prisma.TransactionClient, actor: FinanceActor, range: ReturnType<typeof parseFinanceQuery>, asOf: string, readers: FinanceRecognitionPublicReaders, costs: FinanceRecognitionCostReader, limit: number) {
  const [candidates, resources, costRead] = await Promise.all([
    readers.candidates(tx, { businessId: actor.businessId, ...range, asOf, limit }),
    tx.resource.findMany({ where: { businessId: actor.businessId }, select: { id: true, name: true, status: true }, orderBy: { id: 'asc' }, take: limit + 1 }),
    costs.read(tx, { businessId: actor.businessId, ...range, asOf }),
  ]);
  const candidateIds = candidates.map(row => row.bookingId);
  const candidateSql = candidateIds.length ? Prisma.sql`t."bookingId" IN (${Prisma.join(candidateIds)})` : Prisma.sql`FALSE`;
  const allTerminalRows = await tx.$queryRaw<FinanceRecognitionTerminalRow[]>(Prisma.sql`SELECT t.* FROM (SELECT DISTINCT ON ("bookingId") * FROM "FinanceTerminalRecognition" WHERE "businessId"=${actor.businessId} AND "recordedAt"<=${new Date(asOf)} ORDER BY "bookingId",version DESC) t WHERE (${candidateSql}) OR (t."recognitionOn">=${range.from}::date AND t."recognitionOn"<${range.to}::date) ORDER BY t."bookingId" LIMIT 5001`);
  const terminalRows = allTerminalRows.filter(row => row.recognitionOn.toISOString().slice(0, 10) >= range.from && row.recognitionOn.toISOString().slice(0, 10) < range.to);
  const requestedBookings = [...new Set([...candidates.map(row => row.bookingId), ...terminalRows.map(row => row.bookingId)])];
  const relevant = requestedBookings.length ? Prisma.sql`c."bookingId" IN (${Prisma.join(requestedBookings)})` : Prisma.sql`FALSE`;
  const certificates = await tx.$queryRaw<(RecognitionCertificateRow & { certifiedUnitCount: bigint })[]>(Prisma.sql`SELECT c.*,(SELECT COUNT(*) FROM "FinanceServiceUnit" u WHERE u."certificateId"=c.id AND u."businessId"=c."businessId") AS "certifiedUnitCount" FROM (SELECT DISTINCT ON ("bookingId") * FROM "FinanceServiceCertificate" WHERE "businessId"=${actor.businessId} AND "recordedAt"<=${new Date(asOf)} ORDER BY "bookingId",version DESC) c WHERE (${relevant}) OR EXISTS(SELECT 1 FROM "FinanceServiceUnit" u WHERE u."certificateId"=c.id AND u."businessId"=c."businessId" AND u."localNight">=${range.from}::date AND u."localNight"<${range.to}::date) ORDER BY c."bookingId" LIMIT 5001`);
  const bookingIds = [...new Set([...requestedBookings, ...certificates.map(row => row.bookingId)])];
  recognitionRequire(candidates.length + allTerminalRows.length + resources.length + certificates.length + costRead.costSources.length + costRead.ownerWorkSources.length <= limit && bookingIds.length <= limit, 'SOURCE_LIMIT', 'La consulta supera 5000 fuentes; no se entrega un resultado truncado.');
  const [evidence, currentPrices, servicePrices, unitRows] = await Promise.all([
    readers.evidenceBatch(tx, actor.businessId, bookingIds, limit),
    readers.currentPricingBatch(tx, actor.businessId, bookingIds),
    readers.servicePricingBatch(tx, actor.businessId, bookingIds),
    certificates.length ? tx.$queryRaw<{ certificateId: string; bookingId: string; localNight: Date; amountMinor: bigint }[]>(Prisma.sql`SELECT "certificateId","bookingId","localNight","amountMinor" FROM "FinanceServiceUnit" WHERE "businessId"=${actor.businessId} AND "certificateId" IN (${Prisma.join(certificates.map(row => row.id))}) AND "localNight">=${range.from}::date AND "localNight"<${range.to}::date ORDER BY "localNight","bookingId" LIMIT 5001`) : Promise.resolve([]),
  ]);
  const priceParts = [...currentPrices.values(), ...servicePrices.values()].reduce((sum, price) => sum + price.items.reduce((parts, item) => parts + 1 + item.breakdown.length, 0), 0);
  const fixedPriceParts = certificates.reduce((sum, row) => sum + ((row.pricing as unknown as { breakdown?: unknown[] }).breakdown?.length ?? 0), 0);
  const sourceCount = candidates.length + certificates.length + unitRows.length + allTerminalRows.length + resources.length + costRead.costSources.reduce((sum, source) => sum + 1 + source.allocations.length, 0) + costRead.ownerWorkSources.reduce((sum, source) => sum + 1 + source.allocations.length, 0) + currentPrices.size + servicePrices.size + priceParts + fixedPriceParts;
  recognitionRequire(sourceCount <= limit, 'SOURCE_LIMIT', 'La lectura completa supera 5000 fuentes; reduce el período.');
  const byBooking = new Map(certificates.map(row => [row.bookingId, row]));
  const byId = new Map(certificates.map(row => [row.id, row]));
  return { candidates, candidateIds, allTerminalRows, terminalRows, requestedBookings, certificates, bookingIds, evidence, currentPrices, servicePrices, unitRows, resources, costRead, sourceCount, byBooking, byId };
}
type ProjectionSources = Awaited<ReturnType<typeof loadRecognitionProjectionSources>>;
type ProjectionCoverage = ReturnType<typeof collectRecognitionCoverage>;
function collectRecognitionCoverage(state: ProjectionSources, actor: FinanceActor, range: ReturnType<typeof parseFinanceQuery>, asOf: string, timeZone: string, limit: number) {
  const { bookingIds, currentPrices, servicePrices, sourceCount } = state;
  const pendingByReason: Record<string, number> = {};
  const pendingServiceNights: { sourceId: string; sourceVersion: string; bookingId: string; localNight: string; reason: 'SERVICE_NIGHT_NOT_CERTIFIED' }[] = [];
  const addPending = (reason: string, count = 1) => { pendingByReason[reason] = (pendingByReason[reason] ?? 0) + count; };
  for (const price of [...currentPrices.values(), ...servicePrices.values()]) recognitionRequire(price.businessId === actor.businessId && bookingIds.includes(price.bookingId), 'SOURCE_SCOPE_CONFLICT', 'El lector público devolvió precio de otra fuente o Negocio.');
  collectCandidateCoverage(state, addPending);
  collectCertifiedNightCoverage(state, actor, range, asOf, timeZone, pendingServiceNights, addPending);
  recognitionRequire(sourceCount + pendingServiceNights.length <= limit, 'SOURCE_LIMIT', 'La cobertura completa de noches excede 5000 fuentes; no se trunca.');
  return { pendingByReason, pendingServiceNights };
}

type PendingAdder = (reason: string, count?: number) => void;
function collectCandidateCoverage(state: ProjectionSources, addPending: PendingAdder): void {
  const { candidates } = state;
  for (const candidate of candidates) {
    collectOneCandidateCoverage(candidate, state, addPending);
  }
}
function collectCertifiedNightCoverage(state: ProjectionSources, actor: FinanceActor, range: ReturnType<typeof parseFinanceQuery>, asOf: string, timeZone: string, pendingServiceNights: ProjectionCoverage['pendingServiceNights'], addPending: PendingAdder): void {
  const { certificates, unitRows } = state;
  for (const row of certificates) {
    const fixed = checkCertificateCoverageSource(row, state, actor, addPending);
    // Un reverso vacío firmado revoca prestación; su tramo anterior es procedencia, no servicio pendiente.
    if (row.certifiedUnitCount === 0n && row.supersedesCertificateId !== null) continue;
    const effectiveFrom = row.effectiveCheckInOn.toISOString().slice(0, 10);
    const effectiveTo = completedEffectiveEnd(row, fixed.checkOutDate, asOf, timeZone);
    const certified = new Set(unitRows.filter(unit => unit.certificateId === row.id).map(unit => unit.localNight.toISOString().slice(0, 10)));
    // Sólo el tramo manual fijado permite buscar huecos. El extremo es exclusivo; hoy no es noche completada.
    if (effectiveFrom < effectiveTo) for (const localNight of recognitionStay(effectiveFrom, effectiveTo)) if (localNight >= range.from && localNight < range.to && !certified.has(localNight)) {
      pendingServiceNights.push({ sourceId: `SERVICE_CERTIFICATE:${row.id}:${localNight}`, sourceVersion: String(row.version), bookingId: row.bookingId, localNight, reason: 'SERVICE_NIGHT_NOT_CERTIFIED' });
      addPending('SERVICE_NIGHT_NOT_CERTIFIED');
    }
  }
}

function mapTerminalEntry(row: FinanceRecognitionTerminalRow, state: ProjectionSources & { range: ReturnType<typeof parseFinanceQuery> }, addPending: PendingAdder) {
  const { range } = state;
    recognitionRequire(row.amountMinor >= 0n && row.serviceAmountMinor >= 0n && row.finalAmountMinor === row.amountMinor + row.serviceAmountMinor && ['COMPLETE', 'DECLARED_NONE'].includes(row.coverage), 'TERMINAL_AMOUNT_CONFLICT', 'La partida terminal no conserva su cobertura e importe residual.');
    const stale = terminalEntryIsStale(row, state);
    if (stale && (row.recognitionOn.toISOString().slice(0, 10) < range.from || row.recognitionOn.toISOString().slice(0, 10) >= range.to)) addPending('TERMINAL_SOURCE_STALE');
    return { id: row.id, version: row.version, bookingId: row.bookingId, resourceId: row.resourceId, recognitionOn: row.recognitionOn.toISOString().slice(0, 10), amountMinor: recognitionSafe(row.amountMinor), finalAmountMinor: recognitionSafe(row.finalAmountMinor), serviceAmountMinor: recognitionSafe(row.serviceAmountMinor), pricingRevisionId: row.pricingRevisionId, serviceCertificateId: row.serviceCertificateId, serviceCertificateVersion: row.serviceCertificateVersion, coverage: row.coverage, classification: row.classification, reason: row.reason, recordedAt: row.recordedAt.toISOString(), stale };
}

function terminalEntryIsStale(row: FinanceRecognitionTerminalRow, state: ProjectionSources): boolean {
  const current = state.currentPrices.get(row.bookingId); const certificate = state.byBooking.get(row.bookingId);
  const linked = linkedTerminalCertificate(row, certificate);
  const stale = terminalPricingIsStale(row, current) || !linked || !['CANCELLED', 'NO_SHOW'].includes(state.evidence.get(row.bookingId)?.status ?? '');
  return stale;
}

function collectOneCandidateCoverage(candidate: ProjectionSources['candidates'][number], state: ProjectionSources, addPending: PendingAdder): void {
  const { allTerminalRows, currentPrices, byBooking } = state;
    if (candidate.status === 'CANCELLED' || candidate.status === 'NO_SHOW') {
      if (!allTerminalRows.some(row => row.bookingId === candidate.bookingId) && currentPrices.get(candidate.bookingId)?.kind === 'TERMINAL_FINAL_AMOUNT') addPending('TERMINAL_NOT_CLASSIFIED');
      return;
    }
    if (!candidateHasServiceContext(candidate)) addPending('SERVICE_CONTEXT_UNAVAILABLE');
    else if (!byBooking.has(candidate.bookingId)) addPending(candidate.checkInEventId ? 'SERVICE_NOT_CERTIFIED' : 'SERVICE_EVIDENCE_UNAVAILABLE');
}

function checkCertificateCoverageSource(row: ProjectionSources['certificates'][number], state: ProjectionSources, actor: FinanceActor, addPending: PendingAdder) {
  const { evidence, servicePrices } = state;
    const booking = evidence.get(row.bookingId); const pricing = servicePrices.get(row.bookingId);
    recognitionRequire(booking && row.businessId === actor.businessId && row.servicePolicyVersion === 'NIGHT_SERVICE_V1', 'SOURCE_SCOPE_CONFLICT', 'El certificado no conserva fuentes tenant-scoped soportadas.');
    const fixed = row.pricing as unknown as { sourceId: string; checkInDate: string; checkOutDate: string };
    if (!pricing || pricing.id !== fixed.sourceId) addPending('CERTIFICATE_PRICING_STALE');
    if (booking.checkInDate !== fixed.checkInDate || booking.checkOutDate !== fixed.checkOutDate || booking.resourceIds.length !== 1 || booking.resourceIds[0] !== row.resourceId) addPending('CERTIFICATE_CONTEXT_STALE');
    recognitionRequire(row.certifiedUnitCount >= 0n && row.certifiedUnitCount <= 366n, 'SOURCE_LIMIT', 'El certificado conserva un conjunto completo acotado de unidades.');
    return fixed;
}

function completedEffectiveEnd(row: RecognitionCertificateRow, agreedEnd: string, asOf: string, timeZone: string): string {
  return [row.effectiveCheckOutOn?.toISOString().slice(0, 10) ?? agreedEnd, agreedEnd, recognitionLocalToday(new Date(asOf), timeZone)].sort()[0];
}

function candidateHasServiceContext(candidate: ProjectionSources['candidates'][number]): boolean {
  return candidate.checkInDate !== null && candidate.checkOutDate !== null && candidate.resourceIds.length === 1;
}

function linkedTerminalCertificate(row: FinanceRecognitionTerminalRow, certificate: RecognitionCertificateRow | undefined): boolean {
  return (certificate?.id ?? null) === row.serviceCertificateId && (certificate?.version ?? 0) === row.serviceCertificateVersion;
}
function terminalPricingIsStale(row: FinanceRecognitionTerminalRow, current: ProjectionSources['currentPrices'] extends Map<string, infer T> ? T | undefined : never): boolean {
  return !current || current.kind !== 'TERMINAL_FINAL_AMOUNT' || current.pricingRevisionId !== row.pricingRevisionId || terminalRecognitionSourceHash(current) !== row.terminalSourceHash;
}
