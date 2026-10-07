import { Prisma } from '@prisma/client';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceBookingResult, FinanceBookingResultQuery, FinanceBookingTerminalEntry } from '../domain/finance-booking-result.types';
import type { FinancialSourceRef } from '../domain/finance-close.types';
import type { ServiceCertificate } from '../domain/finance-recognition.types';
import { FinanceRecognitionError, recognitionInstant, recognitionRequire, recognitionSafe, recognitionStay } from '../domain/finance-recognition.support';
import { parseFinanceQuery } from '../domain/finance-validation';
import { mapRecognitionCertificate, recognitionHash, recognitionLocalToday, type RecognitionCertificateRow } from './finance-recognition.db';
import type { FinanceRecognitionPublicReaders, FinanceServiceEvidence } from './finance-recognition.readers';
import type { FinanceRecognitionTerminalRow } from './finance-recognition.report';
import { mapServicePricingBasis, terminalRecognitionSourceHash } from './finance-recognition.source';

type ServicePrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>>>;
type CurrentPrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>>>;
interface DirectCostRow {
  expenseId: string; expenseVersion: number; lineId: string; businessId: string; bookingId: string;
  consumedOn: Date; amountMinor: bigint; operational: boolean; createdAt: Date;
  bookingSourceUpdatedAt: Date | null; bookingSourceStatus: string | null;
  latestAuditId: string | null; latestAuditAt: Date | null; reference: string | null; hasEvidenceFile: boolean;
}
interface BookingSources {
  booking: FinanceServiceEvidence; servicePricing: ServicePrice | null; currentPricing: CurrentPrice | null;
  certificate: ServiceCertificate | null; certificateRow: RecognitionCertificateRow | null;
  terminal: FinanceRecognitionTerminalRow | null; costs: DirectCostRow[]; sourceCount: number;
}
type Range = ReturnType<typeof parseFinanceQuery>;
type Pending = Record<string, number>;
const SOURCE_LIMIT = 5000;

/** OWNER y corte coherente se comprueban por el repositorio, en la misma transacción RR. */
export async function readFinanceBookingResult(tx: Prisma.TransactionClient, actor: FinanceActor, bookingId: string, query: FinanceBookingResultQuery, timeZone: string, serverCut: string, readers: FinanceRecognitionPublicReaders): Promise<FinanceBookingResult> {
  const range = parseFinanceQuery(query.from, query.to);
  const asOf = query.asOf ?? serverCut;
  recognitionInstant(asOf); recognitionInstant(serverCut);
  recognitionRequire(asOf <= serverCut, 'INVALID_SOURCE_CUT', 'El corte no puede ser futuro.');
  const booking = await readers.evidence(tx, actor.businessId, bookingId);
  recognitionRequire(booking && booking.businessId === actor.businessId && booking.bookingId === bookingId, 'SOURCE_NOT_FOUND', 'Reserva no disponible.');
  const sources = await loadBookingSources(tx, actor, booking, range, asOf, readers);
  const pendingByReason = collectBookingCoverage(sources, range, asOf, timeZone);
  const terminalEntries = bookingTerminalEntries(sources, range, pendingByReason);
  sources.sourceCount += pendingByReason.SERVICE_NIGHT_NOT_CERTIFIED ?? 0;
  recognitionRequire(sources.sourceCount <= SOURCE_LIMIT, 'SOURCE_LIMIT', 'La cobertura completa de la reserva excede 5000 fuentes; no se trunca.');
  const result = projectBookingResult(actor, sources, range, asOf, timeZone, pendingByReason, terminalEntries);
  const token = recognitionHash({ result, booking, servicePricing: sources.servicePricing, currentPricing: sources.currentPricing, certificate: sources.certificate, terminal: sources.terminal, costs: sources.costs });
  recognitionRequire(query.expectedSourceToken === undefined || query.expectedSourceToken === token, 'SOURCE_TOKEN_CONFLICT', 'Las fuentes cambiaron; actualiza el resultado de la reserva.');
  return { ...result, asOf, token };
}

async function loadBookingSources(tx: Prisma.TransactionClient, actor: FinanceActor, booking: FinanceServiceEvidence, range: Range, asOf: string, readers: FinanceRecognitionPublicReaders): Promise<BookingSources> {
  const [servicePricing, currentPricing, certificates, terminals, costs] = await Promise.all([
    readers.servicePricing(tx, actor.businessId, booking.bookingId),
    readers.currentPricing(tx, actor.businessId, booking.bookingId),
    tx.$queryRaw<RecognitionCertificateRow[]>(Prisma.sql`SELECT * FROM "FinanceServiceCertificate" WHERE "businessId"=${actor.businessId} AND "bookingId"=${booking.bookingId} AND "recordedAt"<=${new Date(asOf)} ORDER BY version DESC LIMIT 1`),
    tx.$queryRaw<FinanceRecognitionTerminalRow[]>(Prisma.sql`SELECT * FROM "FinanceTerminalRecognition" WHERE "businessId"=${actor.businessId} AND "bookingId"=${booking.bookingId} AND "recordedAt"<=${new Date(asOf)} ORDER BY version DESC LIMIT 1`),
    tx.$queryRaw<DirectCostRow[]>(Prisma.sql`SELECT e.id AS "expenseId",e.version AS "expenseVersion",l.id AS "lineId",l."businessId",l."bookingId",e."consumedOn",l."amountMinor",l.operational,e."createdAt",e.reference,EXISTS(SELECT 1 FROM "FinanceEvidenceFile" f WHERE f."businessId"=e."businessId" AND f."expenseId"=e.id AND f."createdAt"<=${new Date(asOf)}) AS "hasEvidenceFile",l."bookingSourceUpdatedAt",l."bookingSourceStatus",a.id AS "latestAuditId",a."occurredAt" AS "latestAuditAt" FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" LEFT JOIN LATERAL (SELECT id,"occurredAt" FROM "FinanceAudit" WHERE "businessId"=e."businessId" AND "sourceId"=e.id ORDER BY "occurredAt" DESC,id DESC LIMIT 1) a ON TRUE WHERE l."businessId"=${actor.businessId} AND l."bookingId"=${booking.bookingId} AND l.operational=TRUE AND e."consumedOn">=${range.from}::date AND e."consumedOn"<${range.to}::date AND e."createdAt"<=${new Date(asOf)} ORDER BY e."consumedOn",e.id,l.id LIMIT 5001`),
  ]);
  const certificateRow = certificates[0] ?? null;
  const units = certificateRow ? await tx.$queryRaw<{ localNight: Date; amountMinor: bigint }[]>(Prisma.sql`SELECT "localNight","amountMinor" FROM "FinanceServiceUnit" WHERE "businessId"=${actor.businessId} AND "bookingId"=${booking.bookingId} AND "certificateId"=${certificateRow.id} ORDER BY "localNight" LIMIT 367`) : [];
  const certificate = certificateRow ? mapRecognitionCertificate(certificateRow, units) : null;
  const sourceCount = 1 + pricingSourceCount(servicePricing) + pricingSourceCount(currentPricing) + certificates.length + terminals.length + units.length + fixedPricingParts(certificate) + costs.length + new Set(costs.map(row => row.expenseId)).size + new Set(costs.flatMap(row => row.latestAuditId ? [row.latestAuditId] : [])).size;
  recognitionRequire(units.length <= 366 && sourceCount <= SOURCE_LIMIT, 'SOURCE_LIMIT', 'La reserva excede 5000 fuentes o 366 noches; no se trunca.');
  assertBookingSourceScope(actor, booking, servicePricing, currentPricing, certificate, costs);
  return { booking, servicePricing, currentPricing, certificate, certificateRow, terminal: terminals[0] ?? null, costs, sourceCount };
}

function pricingSourceCount(price: CurrentPrice | null): number {
  return price ? 1 + price.items.reduce((sum, item) => sum + 1 + item.breakdown.length, 0) : 0;
}
function fixedPricingParts(certificate: ServiceCertificate | null): number { return certificate?.pricing.breakdown.length ?? 0; }
function assertBookingSourceScope(actor: FinanceActor, booking: FinanceServiceEvidence, service: ServicePrice | null, current: CurrentPrice | null, certificate: ServiceCertificate | null, costs: DirectCostRow[]): void {
  for (const price of [service, current]) if (price) recognitionRequire(price.businessId === actor.businessId && price.bookingId === booking.bookingId, 'SOURCE_SCOPE_CONFLICT', 'El precio no corresponde a esta reserva y Negocio.');
  if (certificate) recognitionRequire(certificate.businessId === actor.businessId && certificate.bookingId === booking.bookingId, 'SOURCE_SCOPE_CONFLICT', 'El certificado no corresponde a esta reserva y Negocio.');
  for (const cost of costs) recognitionRequire(cost.businessId === actor.businessId && cost.bookingId === booking.bookingId && cost.operational, 'SOURCE_SCOPE_CONFLICT', 'El costo debe vincular esta reserva explícitamente.');
}

function addPending(pending: Pending, reason: string): void { pending[reason] = (pending[reason] ?? 0) + 1; }
function collectBookingCoverage(sources: BookingSources, range: Range, asOf: string, timeZone: string): Pending {
  const pending: Pending = {};
  if (sources.booking.bookingUpdatedAt > asOf) addPending(pending, 'SOURCE_STALE');
  for (const price of [sources.currentPricing, sources.servicePricing]) if (price && price.createdAt.toISOString() > asOf) addPending(pending, 'SOURCE_STALE');
  if (sources.certificate) collectCertifiedBookingCoverage(sources, range, asOf, timeZone, pending);
  else collectUncertifiedBookingCoverage(sources, range, pending);
  for (const cost of sources.costs) collectDirectCostCoverage(cost, sources.booking, asOf, pending);
  return pending;
}
function collectCertifiedBookingCoverage(sources: BookingSources, range: Range, asOf: string, timeZone: string, pending: Pending): void {
  const certificate = sources.certificate;
  recognitionRequire(certificate, 'SOURCE_SCOPE_CONFLICT', 'Se requiere certificado fijado.');
  if (!servicePricingMatches(certificate, sources.servicePricing)) addPending(pending, 'CERTIFICATE_PRICING_STALE');
  if (!certifiedBookingContextMatches(certificate, sources.booking)) addPending(pending, 'CERTIFICATE_CONTEXT_STALE');
  if (certificate.units.length === 0 && certificate.supersedesCertificateId !== null) return;
  const end = completedCertificateEnd(certificate, asOf, timeZone);
  const certified = new Set(certificate.units.map(unit => unit.localNight));
  if (certificate.effectiveCheckInOn >= end) return;
  for (const localNight of recognitionStay(certificate.effectiveCheckInOn, end)) if (range.from <= localNight && localNight < range.to && !certified.has(localNight)) addPending(pending, 'SERVICE_NIGHT_NOT_CERTIFIED');
}
function servicePricingMatches(certificate: ServiceCertificate, price: ServicePrice | null): boolean {
  if (!price || price.id !== certificate.pricing.sourceId) return false;
  try { return recognitionHash(mapServicePricingBasis(price)) === recognitionHash(certificate.pricing); }
  catch (error: unknown) { if (!(error instanceof FinanceRecognitionError)) throw error; return false; }
}
function completedCertificateEnd(certificate: ServiceCertificate, asOf: string, timeZone: string): string {
  return [certificate.effectiveCheckOutOn ?? certificate.pricing.checkOutDate, certificate.pricing.checkOutDate, recognitionLocalToday(new Date(asOf), timeZone)].sort()[0];
}
function certifiedBookingContextMatches(certificate: ServiceCertificate, booking: FinanceServiceEvidence): boolean {
  return booking.checkInDate === certificate.pricing.checkInDate && booking.checkOutDate === certificate.pricing.checkOutDate && booking.resourceIds.length === 1 && booking.resourceIds[0] === certificate.resourceId;
}
function bookingIsCandidate(booking: FinanceServiceEvidence, range: Range): boolean {
  return booking.status !== 'DRAFT' && (booking.checkInDate === null || booking.checkOutDate === null || booking.checkInDate < range.to && booking.checkOutDate > range.from);
}
function collectUncertifiedBookingCoverage(sources: BookingSources, range: Range, pending: Pending): void {
  const { booking } = sources;
  if (!bookingIsCandidate(booking, range)) return;
  if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) {
    if (!sources.terminal && sources.currentPricing?.kind === 'TERMINAL_FINAL_AMOUNT') addPending(pending, 'TERMINAL_NOT_CLASSIFIED');
    return;
  }
  if (booking.checkInDate === null || booking.checkOutDate === null || booking.resourceIds.length !== 1) addPending(pending, 'SERVICE_CONTEXT_UNAVAILABLE');
  else addPending(pending, booking.checkInEventId ? 'SERVICE_NOT_CERTIFIED' : 'SERVICE_EVIDENCE_UNAVAILABLE');
}
function collectDirectCostCoverage(cost: DirectCostRow, booking: FinanceServiceEvidence, asOf: string, pending: Pending): void {
  if (cost.reference === null && !cost.hasEvidenceFile) addPending(pending, 'COST_EVIDENCE_MISSING');
  if (cost.latestAuditAt && cost.latestAuditAt.toISOString() > asOf) addPending(pending, 'SOURCE_STALE');
  if (cost.bookingSourceUpdatedAt?.toISOString() !== booking.bookingUpdatedAt || cost.bookingSourceStatus !== booking.status) addPending(pending, 'DIRECT_COST_BOOKING_SOURCE_STALE');
}

function bookingTerminalEntries(sources: BookingSources, range: Range, pending: Pending): FinanceBookingTerminalEntry[] {
  const row = sources.terminal;
  if (!row) return [];
  assertTerminalIdentity(row, sources.booking.bookingId);
  const stale = terminalSourceStale(row, sources);
  if (stale) addPending(pending, 'TERMINAL_SOURCE_STALE');
  const recognitionOn = row.recognitionOn.toISOString().slice(0, 10);
  if (recognitionOn < range.from || recognitionOn >= range.to) return [];
  return [{ id: row.id, version: row.version, bookingId: row.bookingId, resourceId: row.resourceId, recognitionOn, amountMinor: recognitionSafe(row.amountMinor), finalAmountMinor: recognitionSafe(row.finalAmountMinor), serviceAmountMinor: recognitionSafe(row.serviceAmountMinor), pricingRevisionId: row.pricingRevisionId, serviceCertificateId: row.serviceCertificateId, serviceCertificateVersion: row.serviceCertificateVersion, coverage: row.coverage, classification: row.classification, stale }];
}
function assertTerminalIdentity(row: FinanceRecognitionTerminalRow, bookingId: string): void {
  recognitionRequire(row.bookingId === bookingId && row.amountMinor >= 0n && row.serviceAmountMinor >= 0n && row.finalAmountMinor === row.amountMinor + row.serviceAmountMinor, 'TERMINAL_AMOUNT_CONFLICT', 'La partida terminal debe conservar F=S+N para esta reserva.');
  recognitionRequire(['COMPLETE', 'DECLARED_NONE'].includes(row.coverage) && (row.coverage !== 'DECLARED_NONE' || row.serviceAmountMinor === 0n), 'TERMINAL_COVERAGE_CONFLICT', 'La partida terminal debe conservar la cobertura declarada.');
}
function terminalSourceStale(row: FinanceRecognitionTerminalRow, sources: BookingSources): boolean {
  if (!terminalPricingMatches(row, sources.currentPricing)) return true;
  if (!['CANCELLED', 'NO_SHOW'].includes(sources.booking.status)) return true;
  if (row.serviceCertificateId !== (sources.certificate?.id ?? null) || row.serviceCertificateVersion !== (sources.certificate?.version ?? 0)) return true;
  assertLinkedTerminalServiceAmount(row, sources.certificate);
  return false;
}
function assertLinkedTerminalServiceAmount(row: FinanceRecognitionTerminalRow, certificate: ServiceCertificate | null): void {
  const service = (certificate?.units ?? []).reduce((sum, unit) => sum + BigInt(unit.amountMinor), 0n);
  recognitionRequire(service === row.serviceAmountMinor, 'TERMINAL_AMOUNT_CONFLICT', 'El servicio terminal debe reproducir las noches certificadas vinculadas.');
}
function terminalPricingMatches(row: FinanceRecognitionTerminalRow, price: CurrentPrice | null): boolean {
  return price !== null && price.kind === 'TERMINAL_FINAL_AMOUNT' && price.pricingRevisionId === row.pricingRevisionId && terminalRecognitionSourceHash(price) === row.terminalSourceHash;
}

function projectBookingResult(actor: FinanceActor, sources: BookingSources, range: Range, asOf: string, timeZone: string, pendingByReason: Pending, terminalEntries: FinanceBookingTerminalEntry[]): Omit<FinanceBookingResult, 'asOf' | 'token'> {
  const certificate = sources.certificate;
  const units = certificate ? certificate.units.filter(unit => range.from <= unit.localNight && unit.localNight < range.to).map(unit => ({ ...unit, certificateId: certificate.id, certificateVersion: certificate.version, bookingId: certificate.bookingId, resourceId: certificate.resourceId })) : [];
  const serviceRevenue = units.reduce((sum, unit) => sum + BigInt(unit.amountMinor), 0n);
  const terminalRevenue = terminalEntries.filter(entry => !entry.stale).reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
  const directCost = sources.costs.reduce((sum, row) => sum + row.amountMinor, 0n);
  const revenue = serviceRevenue + terminalRevenue; const contribution = revenue - directCost;
  const complete = Object.keys(pendingByReason).length === 0;
  return {
    businessId: actor.businessId, bookingId: sources.booking.bookingId, resourceId: sources.booking.resourceIds.length === 1 ? sources.booking.resourceIds[0] : null,
    ...range, timeZone, currency: 'PYG', scope: 'DIRECT_BOOKING_COSTS_ONLY', sourceLimit: SOURCE_LIMIT, sourceCount: sources.sourceCount,
    serviceRevenueMinor: recognitionSafe(serviceRevenue), terminalRevenueMinor: recognitionSafe(terminalRevenue), revenueMinor: recognitionSafe(revenue), directOperationalCostMinor: recognitionSafe(directCost),
    contributionMinor: complete ? recognitionSafe(contribution) : null, contributionMarginBasisPoints: complete && revenue > 0n ? recognitionSafe(contribution * 10000n / revenue) : null,
    coverage: { complete, pendingByReason, commonCostsExcluded: true, laborEstimatesExcluded: true, ownerWorkExcluded: true }, units, terminalEntries,
    directCostLines: sources.costs.map(row => ({ expenseId: row.expenseId, expenseVersion: row.expenseVersion, lineId: row.lineId, consumedOn: row.consumedOn.toISOString().slice(0, 10), amountMinor: recognitionSafe(row.amountMinor), bookingSourceUpdatedAt: row.bookingSourceUpdatedAt?.toISOString() ?? null, bookingSourceStatus: row.bookingSourceStatus })),
    sourceRefs: bookingSourceRefs(sources, asOf),
  };
}
function bookingSourceRefs(sources: BookingSources, asOf: string): FinancialSourceRef[] {
  const refs: FinancialSourceRef[] = [{ type: 'BOOKING', id: sources.booking.bookingId, version: sources.booking.bookingUpdatedAt }];
  for (const price of [sources.servicePricing, sources.currentPricing]) if (price) refs.push({ type: price.kind === 'SERVICE' ? 'SERVICE_PRICING' : 'TERMINAL_PRICING', id: price.id, version: recognitionHash(price) });
  if (sources.certificate) refs.push({ type: 'SERVICE_CERTIFICATE', id: sources.certificate.id, version: String(sources.certificate.version) });
  if (sources.terminal) refs.push({ type: 'TERMINAL_RECOGNITION', id: sources.terminal.id, version: String(sources.terminal.version) });
  for (const row of sources.costs) {
    recognitionRequire(row.createdAt.toISOString() <= asOf && row.amountMinor >= 0n, 'SOURCE_CUT_CONFLICT', 'El costo requiere importe seguro y creación dentro del corte.');
    refs.push({ type: 'EXPENSE', id: row.expenseId, version: String(row.expenseVersion) }, { type: 'EXPENSE_LINE', id: row.lineId, version: recognitionHash(row) });
  }
  return [...new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref])).values()].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
}
