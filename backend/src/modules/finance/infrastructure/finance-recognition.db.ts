import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FinanceActor } from '../domain/finance.types';
import { FinanceRecognitionError, recognitionRequire, recognitionSafe } from '../domain/finance-recognition.support';
import type { ClosedFinancialPeriod, FinancePeriod, FinancialSourceRef } from '../domain/finance-close.types';
import type { RecognitionHead, ServiceCertificate, ServicePricingBasis } from '../domain/finance-recognition.types';
import { assertFinancePeriodOpen, FinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';

export function recognitionJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? recognitionSafe(item) : item)) as Prisma.InputJsonValue;
}
export function recognitionHash(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable) : item !== null && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, part]) => [key, stable(part)])) : item;
  return createHash('sha256').update(JSON.stringify(stable(recognitionJson(value)))).digest('hex');
}
export async function authorizeRecognitionOwner(tx: Prisma.TransactionClient, actor: FinanceActor): Promise<void> {
  const users = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM "User" WHERE id=${actor.actorUserId} FOR SHARE`);
  recognitionRequire(users[0]?.status === 'ACTIVE', 'FINANCE_FORBIDDEN', 'Acceso financiero no autorizado.');
  const memberships = await tx.$queryRaw<{ role: string }[]>(Prisma.sql`SELECT role FROM "UserBusinessMembership" WHERE "userId"=${actor.actorUserId} AND "businessId"=${actor.businessId} FOR SHARE`);
  recognitionRequire(memberships[0]?.role === 'OWNER', 'FINANCE_FORBIDDEN', 'Finance requiere OWNER vigente del Negocio.');
}
export async function lockRecognitionBusiness(tx: Prisma.TransactionClient, businessId: string, exclusive: boolean, active = true): Promise<{ timezone: string; currency: string }> {
  const lock = exclusive ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
  const rows = await tx.$queryRaw<{ timezone: string; currency: string; status: string }[]>(Prisma.sql`SELECT timezone,currency,status FROM "Business" WHERE id=${businessId} ${lock}`);
  recognitionRequire(rows[0], 'SOURCE_NOT_FOUND', 'Negocio no disponible.');
  recognitionRequire(!active || rows[0].status === 'ACTIVE', 'BUSINESS_STATE_CONFLICT', 'El Negocio no está activo.');
  recognitionRequire(rows[0].currency === 'PYG', 'CURRENCY_CONFLICT', 'Finance admite únicamente PYG.');
  return rows[0];
}
export async function lockRecognitionBooking(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Booking" WHERE id=${bookingId} AND "businessId"=${businessId} FOR UPDATE`);
  recognitionRequire(rows[0], 'SOURCE_NOT_FOUND', 'Reserva no disponible.');
}
export async function recognitionReadRequest<T>(tx: Prisma.TransactionClient, actor: FinanceActor, operation: string, key: string): Promise<{ fingerprint: string; result: T } | null> {
  // Namespace tenant/operation/key, sin modificar estado global ni usar lock de Business antes de Booking.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-request:${actor.businessId}:${operation}:${key}`},0))`);
  const rows = await tx.$queryRaw<{ fingerprint: string; result: Prisma.JsonValue }[]>(Prisma.sql`SELECT fingerprint,result FROM "FinanceRequest" WHERE "businessId"=${actor.businessId} AND operation=${operation} AND "idempotencyKey"=${key}`);
  return rows[0] ? { fingerprint: rows[0].fingerprint, result: rows[0].result as unknown as T } : null;
}
export async function recognitionInsertRequest(tx: Prisma.TransactionClient, actor: FinanceActor, operation: string, key: string, fingerprint: string, result: unknown, id = randomUUID()): Promise<string> {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceRequest"(id,"businessId",operation,"idempotencyKey",fingerprint,result,"createdAt") VALUES(${id},${actor.businessId},${operation},${key},${fingerprint},${JSON.stringify(recognitionJson(result))}::jsonb,clock_timestamp())`);
  return id;
}
export async function recognitionInsertAudit(tx: Prisma.TransactionClient, actor: FinanceActor, operation: string, sourceId: string, details: unknown): Promise<void> {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "FinanceAudit"(id,"businessId",action,"sourceId","actorUserId","occurredAt",details) VALUES(${randomUUID()},${actor.businessId},${operation},${sourceId},${actor.actorUserId},clock_timestamp(),${JSON.stringify(recognitionJson(details))}::jsonb)`);
}
export function recognitionLocalToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export async function recognitionAsOf(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ asOf: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS "asOf"`);
  recognitionRequire(rows[0], 'SOURCE_CUT_CONFLICT', 'No se pudo fijar el corte.');
  return rows[0].asOf.toISOString();
}
export interface RecognitionCertificateRow {
  id: string; businessId: string; bookingId: string; resourceId: string; version: number; supersedesCertificateId: string | null;
  originalSnapshotId: string; serviceRevisionId: string | null; sourceHash: string;
  bookingUpdatedAt: Date; effectiveCheckInOn: Date; effectiveCheckOutOn: Date | null; checkInEventId: string; checkOutEventId: string | null;
  pricing: Prisma.JsonValue; policyVersion: string; servicePolicyVersion: string; evidence: string; reason: string; recordedByUserId: string; recordedAt: Date;
}
export function mapRecognitionCertificate(row: RecognitionCertificateRow, units: readonly { localNight: Date; amountMinor: bigint }[]): ServiceCertificate {
  recognitionRequire(row.servicePolicyVersion === 'NIGHT_SERVICE_V1', 'UNSUPPORTED_RECOGNITION_POLICY', 'La política histórica no está soportada.');
  assertCertificatePricing(row);
  recognitionRequire(units.length <= 366 && new Set(units.map(unit => unit.localNight.toISOString())).size === units.length && units.every(unit => unit.amountMinor >= 0n), 'CERTIFICATE_UNITS_CONFLICT', 'Las unidades certificadas deben conservar fechas e importes únicos válidos.');
  return { id: row.id, businessId: row.businessId, bookingId: row.bookingId, resourceId: row.resourceId, version: row.version, supersedesCertificateId: row.supersedesCertificateId, recordedByUserId: row.recordedByUserId, recordedAt: row.recordedAt.toISOString(), bookingUpdatedAt: row.bookingUpdatedAt.toISOString(), effectiveCheckInOn: row.effectiveCheckInOn.toISOString().slice(0, 10), effectiveCheckOutOn: row.effectiveCheckOutOn?.toISOString().slice(0, 10) ?? null, checkInEventId: row.checkInEventId, checkOutEventId: row.checkOutEventId, pricing: row.pricing as unknown as ServicePricingBasis, policyVersion: row.policyVersion as ServiceCertificate['policyVersion'], servicePolicyVersion: 'NIGHT_SERVICE_V1', evidence: row.evidence, reason: row.reason, units: units.map(unit => ({ localNight: unit.localNight.toISOString().slice(0, 10), amountMinor: recognitionSafe(unit.amountMinor) })) };
}
export async function readRecognitionHead(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<RecognitionHead | null> {
  const rows = await tx.$queryRaw<(RecognitionCertificateRow & { headVersion: number; headCertificateId: string })[]>(Prisma.sql`SELECT c.*,h.version AS "headVersion",h."certificateId" AS "headCertificateId" FROM "FinanceServiceHead" h LEFT JOIN "FinanceServiceCertificate" c ON c.id=h."certificateId" AND c."businessId"=h."businessId" AND c."bookingId"=h."bookingId" WHERE h."businessId"=${businessId} AND h."bookingId"=${bookingId}`);
  if (!rows[0]) return null;
  recognitionRequire(rows[0].id === rows[0].headCertificateId && rows[0].version === rows[0].headVersion, 'CERTIFICATE_HEAD_CONFLICT', 'El head no conserva la identidad y versión certificadas.');
  const units = await tx.$queryRaw<{ localNight: Date; amountMinor: bigint }[]>(Prisma.sql`SELECT "localNight","amountMinor" FROM "FinanceServiceUnit" WHERE "businessId"=${businessId} AND "certificateId"=${rows[0].id} ORDER BY "localNight" LIMIT 367`);
  recognitionRequire(units.length <= 366, 'SOURCE_LIMIT', 'El certificado excede el límite técnico de noches.');
  const certificate = mapRecognitionCertificate(rows[0], units);
  return { id: certificate.id, version: certificate.version, certificate };
}
export interface RecognitionPeriodRow { id: string; businessId: string; from: Date; to: Date; timeZone: string; status: string; version: number; latestSnapshotId: string | null }
export function mapRecognitionPeriod(row: RecognitionPeriodRow): FinancePeriod {
  recognitionRequire(row.status === 'OPEN' || row.status === 'CLOSED', 'PERIOD_STATE_CONFLICT', 'El estado del período no está soportado.');
  return { ...row, from: row.from.toISOString().slice(0, 10), to: row.to.toISOString().slice(0, 10), status: row.status };
}
export async function readClosedRecognitionPeriods(tx: Prisma.TransactionClient, businessId: string): Promise<ClosedFinancialPeriod[]> {
  const rows = await tx.$queryRaw<(RecognitionPeriodRow & { sourceRefs: Prisma.JsonValue })[]>(Prisma.sql`SELECT p.*,s."sourceRefs" FROM "FinancePeriod" p JOIN "FinanceCloseSnapshot" s ON s.id=p."latestSnapshotId" AND s."periodId"=p.id AND s."businessId"=p."businessId" WHERE p."businessId"=${businessId} AND p.status='CLOSED' ORDER BY p."from" LIMIT 5001`);
  recognitionRequire(rows.length <= 5000, 'SOURCE_LIMIT', 'Hay demasiados períodos; la guardia no trunca fuentes.');
  return rows.map(row => ({ period: mapRecognitionPeriod(row), sourceRefs: row.sourceRefs as unknown as FinancialSourceRef[] }));
}
export async function recognitionAssertDatabaseOpen(tx: Prisma.TransactionClient, businessId: string, dates: readonly string[], refs: readonly { type: string; id: string }[]): Promise<void> {
  try { await assertFinancePeriodOpen(tx, businessId, dates, refs); }
  catch (error: unknown) {
    if (error instanceof FinancePeriodClosedError) throw new FinanceRecognitionError('FINANCE_PERIOD_CLOSED', error.message);
    throw error;
  }
}

function assertCertificatePricing(row: RecognitionCertificateRow): void {
  const pricing = row.pricing as unknown as ServicePricingBasis;
  recognitionRequire(pricing && pricing.businessId === row.businessId && pricing.bookingId === row.bookingId && pricing.resourceId === row.resourceId && pricing.originalSnapshotId === row.originalSnapshotId && pricing.serviceRevisionId === row.serviceRevisionId && pricing.sourceHash === row.sourceHash && ['BREAKDOWN_BY_DATE_V1', 'WEIGHTED_AGREED_NIGHTS_V1', 'EQUAL_AGREED_NIGHTS_V1'].includes(row.policyVersion), 'SOURCE_SCOPE_CONFLICT', 'La procedencia del certificado no coincide con sus columnas inmutables.');
}
