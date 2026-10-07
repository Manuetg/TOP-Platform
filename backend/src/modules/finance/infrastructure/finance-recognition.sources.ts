import { Prisma } from '@prisma/client';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceProfitabilityQuery, FinanceRecognitionSourceReport, FinanceRecognitionSource } from '../application/finance-recognition.operations';
import type { ServicePricingBasis, RecognitionNight } from '../domain/finance-recognition.types';
import { agreedNightPrices } from '../domain/finance-recognition.rules';
import { FinanceRecognitionError, recognitionMoney, recognitionRequire, recognitionSafe } from '../domain/finance-recognition.support';
import { parseFinanceQuery } from '../domain/finance-validation';
import { recognitionHash, recognitionLocalToday, mapRecognitionCertificate, type RecognitionCertificateRow } from './finance-recognition.db';
import { mapServicePricingBasis, terminalRecognitionSourceHash } from './finance-recognition.source';
import type { FinanceRecognitionPublicReaders } from './finance-recognition.readers';
import type { FinanceRecognitionTerminalRow } from './finance-recognition.report';

/** Prepara selecciones y CAS del formulario; cada noche necesita luego declaración/evidencia manual. */
export async function readFinanceRecognitionSources(tx: Prisma.TransactionClient, actor: FinanceActor, query: FinanceProfitabilityQuery, timeZone: string, asOf: string, readers: FinanceRecognitionPublicReaders): Promise<FinanceRecognitionSourceReport> {
  const range = parseFinanceQuery(query.from, query.to); const limit = 5000;
  const localToday = recognitionLocalToday(new Date(asOf), timeZone);
  const candidates = await readers.candidates(tx, { businessId: actor.businessId, ...range, asOf, limit });
  const bookingIds = candidates.map(row => row.bookingId);
  recognitionRequire(bookingIds.length <= limit && new Set(bookingIds).size === bookingIds.length && candidates.every(row => row.businessId === actor.businessId), 'SOURCE_LIMIT', 'Los candidatos deben ser completos, únicos y tenant-scoped.');
  if (!bookingIds.length) {
    const token = recognitionHash({ businessId: actor.businessId, ...range, timeZone, localToday, sources: [] });
    recognitionRequire(query.expectedSourceToken === undefined || query.expectedSourceToken === token, 'SOURCE_TOKEN_CONFLICT', 'Las fuentes cambiaron; actualiza la selección.');
    return { businessId: actor.businessId, ...range, timeZone, localToday, asOf, token, sourceLimit: limit, sourceCount: 0, sources: [] };
  }
  const [servicePrices, currentPrices, certificates, terminals] = await Promise.all([
    readers.servicePricingBatch(tx, actor.businessId, bookingIds), readers.currentPricingBatch(tx, actor.businessId, bookingIds),
    tx.$queryRaw<RecognitionCertificateRow[]>(Prisma.sql`SELECT DISTINCT ON ("bookingId") * FROM "FinanceServiceCertificate" WHERE "businessId"=${actor.businessId} AND "bookingId" IN (${Prisma.join(bookingIds)}) AND "recordedAt"<=${new Date(asOf)} ORDER BY "bookingId",version DESC LIMIT 5001`),
    tx.$queryRaw<FinanceRecognitionTerminalRow[]>(Prisma.sql`SELECT DISTINCT ON ("bookingId") * FROM "FinanceTerminalRecognition" WHERE "businessId"=${actor.businessId} AND "bookingId" IN (${Prisma.join(bookingIds)}) AND "recordedAt"<=${new Date(asOf)} ORDER BY "bookingId",version DESC LIMIT 5001`),
  ]);
  recognitionRequire(bookingIds.length + certificates.length + terminals.length + servicePrices.size + currentPrices.size <= limit, 'SOURCE_LIMIT', 'La selección completa excede 5000 fuentes.');
  const units = certificates.length ? await tx.$queryRaw<{ certificateId: string; localNight: Date; amountMinor: bigint }[]>(Prisma.sql`SELECT "certificateId","localNight","amountMinor" FROM "FinanceServiceUnit" WHERE "businessId"=${actor.businessId} AND "certificateId" IN (${Prisma.join(certificates.map(row => row.id))}) ORDER BY "certificateId","localNight" LIMIT 5001`) : [];
  const sourceCount = bookingIds.length + certificates.length + terminals.length + servicePrices.size + currentPrices.size + units.length + [...servicePrices.values()].reduce((sum, price) => sum + price.items.reduce((parts, item) => parts + Math.max(item.breakdown.length, item.nights), 0), 0);
  recognitionRequire(sourceCount <= limit, 'SOURCE_LIMIT', 'La selección no trunca certificados ni mapas acordados.');
  recognitionRequire(certificates.every(row => row.businessId === actor.businessId && bookingIds.includes(row.bookingId)) && terminals.every(row => bookingIds.includes(row.bookingId)), 'SOURCE_SCOPE_CONFLICT', 'La selección contiene una historia de otra fuente.');
  const byBooking = new Map(certificates.map(row => [row.bookingId, row])); const terminalByBooking = new Map(terminals.map(row => [row.bookingId, row]));
  const sources = candidates.map(booking => buildRecognitionSource(booking, { actor, localToday, servicePrices, currentPrices, byBooking, terminalByBooking, units }));
  const token = recognitionHash({ businessId: actor.businessId, ...range, timeZone, localToday, sources });
  recognitionRequire(query.expectedSourceToken === undefined || query.expectedSourceToken === token, 'SOURCE_TOKEN_CONFLICT', 'Las fuentes cambiaron; actualiza la selección.');
  return { businessId: actor.businessId, ...range, timeZone, localToday, asOf, token, sourceLimit: limit, sourceCount, sources };
}

type SourceBooking = Awaited<ReturnType<FinanceRecognitionPublicReaders['candidates']>>[number];
type ServicePrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>>>;
type CurrentPrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>>>;
type SourceState = { actor: FinanceActor; localToday: string; servicePrices: Map<string, ServicePrice>; currentPrices: Map<string, CurrentPrice>; byBooking: Map<string, RecognitionCertificateRow>; terminalByBooking: Map<string, FinanceRecognitionTerminalRow>; units: { certificateId: string; localNight: Date; amountMinor: bigint }[] };
function buildRecognitionSource(booking: SourceBooking, state: SourceState): FinanceRecognitionSource {
  const { actor, localToday, servicePrices, currentPrices, byBooking, terminalByBooking, units } = state;
    const service = servicePrices.get(booking.bookingId); const current = currentPrices.get(booking.bookingId);
    const { pricing, agreedNights, certificationBlockers } = buildServiceSelection(booking, service, current, actor);
    const row = byBooking.get(booking.bookingId); const currentCertificate = row ? mapRecognitionCertificate(row, units.filter(unit => unit.certificateId === row.id)) : null;
    const terminal = buildTerminalSelection(booking, current, currentCertificate, terminalByBooking.get(booking.bookingId));
    return { ...booking, pricing, agreedNights, eligibleNights: certificationBlockers.length ? [] : agreedNights.filter(night => night.localNight < localToday).map(night => night.localNight), certificationBlockers, currentCertificate, terminal };
}

function buildServiceSelection(booking: SourceBooking, service: ServicePrice | undefined, current: CurrentPrice | undefined, actor: FinanceActor) {
    assertSelectionPricingScope(booking, service, current, actor);
    let pricing: ServicePricingBasis | null = null; let agreedNights: readonly RecognitionNight[] = []; const certificationBlockers: string[] = [];
    if (!service) certificationBlockers.push('SERVICE_SOURCE_UNAVAILABLE');
    else try { pricing = mapServicePricingBasis(service); agreedNights = agreedNightPrices(pricing).nights; } catch (error: unknown) { if (!(error instanceof FinanceRecognitionError)) throw error; certificationBlockers.push(error.code); }
    addServiceSelectionBlockers(booking, pricing, certificationBlockers);
    return { pricing, agreedNights, certificationBlockers };
}

function buildTerminalSelection(booking: SourceBooking, current: CurrentPrice | undefined, currentCertificate: FinanceRecognitionSource['currentCertificate'], terminalRow: FinanceRecognitionTerminalRow | undefined): FinanceRecognitionSource['terminal'] {
    const linked = linkedServiceCertificate(currentCertificate);
    const serviceAmountMinor = serviceCertificateAmount(currentCertificate);
    let terminal = null;
    if (current?.kind === 'TERMINAL_FINAL_AMOUNT') {
      recognitionRequire(current.pricingRevisionId, 'TERMINAL_SOURCE_CONFLICT', 'La fuente terminal debe ser una revisión clasificada.'); recognitionMoney(current.totalAmountMinor);
      const blockers: string[] = [];
      if (!['CANCELLED', 'NO_SHOW'].includes(booking.status)) blockers.push('TERMINAL_SOURCE_UNAVAILABLE');
      if (current.totalAmountMinor < serviceAmountMinor) blockers.push('TERMINAL_SERVICE_EXCEEDS_FINAL');
      terminal = { pricingRevisionId: current.pricingRevisionId, pricingRevisionNumber: current.revisionNumber, finalAmountMinor: current.totalAmountMinor, expectedVersion: terminalRow?.version ?? 0, serviceCertificateId: linked.id, serviceCertificateVersion: linked.version, serviceAmountMinor, suggestedResidualMinor: current.totalAmountMinor >= serviceAmountMinor ? current.totalAmountMinor - serviceAmountMinor : null, blockers, currentRecognition: terminalRow ? mapCurrentTerminalSelection(terminalRow, current, currentCertificate) : null };
    }
    return terminal;
}

function assertSelectionPricingScope(booking: SourceBooking, service: ServicePrice | undefined, current: CurrentPrice | undefined, actor: FinanceActor): void {
    recognitionRequire((!service || service.businessId === actor.businessId && service.bookingId === booking.bookingId) && (!current || current.businessId === actor.businessId && current.bookingId === booking.bookingId), 'SOURCE_SCOPE_CONFLICT', 'El precio no corresponde a esta reserva y Negocio.');
}

function mapCurrentTerminalSelection(terminalRow: FinanceRecognitionTerminalRow, current: CurrentPrice, currentCertificate: FinanceRecognitionSource['currentCertificate']) {
  return { id: terminalRow.id, version: terminalRow.version, recognitionOn: terminalRow.recognitionOn.toISOString().slice(0, 10), amountMinor: recognitionSafe(terminalRow.amountMinor), coverage: terminalRow.coverage, classification: terminalRow.classification, reason: terminalRow.reason, stale: terminalRow.pricingRevisionId !== current.pricingRevisionId || terminalRow.terminalSourceHash !== terminalRecognitionSourceHash(current) || terminalRow.serviceCertificateId !== (currentCertificate?.id ?? null) || terminalRow.serviceCertificateVersion !== (currentCertificate?.version ?? 0) };
}

function addServiceSelectionBlockers(booking: SourceBooking, pricing: ServicePricingBasis | null, certificationBlockers: string[]): void {
    if (pricing && (booking.checkInDate !== pricing.checkInDate || booking.checkOutDate !== pricing.checkOutDate || booking.resourceIds.length !== 1 || booking.resourceIds[0] !== pricing.resourceId)) certificationBlockers.push('PRICING_CONTEXT_CONFLICT');
    if (!['IN_PROGRESS', 'COMPLETED'].includes(booking.status) || !booking.checkInEventId || booking.status === 'COMPLETED' && !booking.checkOutEventId) certificationBlockers.push('SERVICE_EVIDENCE_UNAVAILABLE');
}

function linkedServiceCertificate(certificate: FinanceRecognitionSource['currentCertificate']): { id: string | null; version: number } {
  return { id: certificate?.id ?? null, version: certificate?.version ?? 0 };
}

function serviceCertificateAmount(certificate: FinanceRecognitionSource['currentCertificate']): number {
  return recognitionSafe((certificate?.units ?? []).reduce((sum, unit) => sum + BigInt(unit.amountMinor), 0n));
}
