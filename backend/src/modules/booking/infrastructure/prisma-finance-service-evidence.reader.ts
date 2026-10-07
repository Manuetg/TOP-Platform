import { Prisma } from '@prisma/client';

export interface FinanceBookingServiceEvidence {
  businessId: string; bookingId: string; resourceIds: string[]; bookingUpdatedAt: string;
  checkInDate: string | null; checkOutDate: string | null; status: string;
  checkInEventId: string | null; checkOutEventId: string | null;
}
interface EvidenceRow { id: string; businessId: string; updatedAt: Date; checkInDate: Date | null; checkOutDate: Date | null; status: string }
export class FinanceServiceEvidenceSourceLimitError extends Error {
  readonly code = 'SOURCE_LIMIT';
  constructor() { super('La evidencia Booking supera el límite técnico; no se entrega truncada.'); this.name = 'FinanceServiceEvidenceSourceLimitError'; }
}
function requireEvidenceLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw new FinanceServiceEvidenceSourceLimitError();
}
export async function readFinanceServiceEvidence(tx: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<FinanceBookingServiceEvidence | null> {
  const result = await readFinanceServiceEvidenceBatch(tx, businessId, [bookingId]);
  return result.get(bookingId) ?? null;
}
export async function listFinanceServiceEvidence(tx: Prisma.TransactionClient, input: { businessId: string; from: string; to: string; asOf: string; limit: number }): Promise<FinanceBookingServiceEvidence[]> {
  requireEvidenceLimit(input.limit);
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Booking" WHERE "businessId"=${input.businessId} AND "createdAt"<=${new Date(input.asOf)} AND status<>'DRAFT' AND (("checkInDate"<${input.to}::date AND "checkOutDate">${input.from}::date) OR "checkInDate" IS NULL OR "checkOutDate" IS NULL) ORDER BY id LIMIT ${input.limit + 1}`);
  if (rows.length > input.limit) throw new FinanceServiceEvidenceSourceLimitError();
  const result = await readFinanceServiceEvidenceBatch(tx, input.businessId, rows.map(row => row.id), input.limit);
  return rows.map(row => result.get(row.id)!);
}
export async function readFinanceServiceEvidenceBatch(tx: Prisma.TransactionClient, businessId: string, bookingIds: readonly string[], limit = 5000): Promise<Map<string, FinanceBookingServiceEvidence>> {
  requireEvidenceLimit(limit);
  if (bookingIds.length > limit || new Set(bookingIds).size !== bookingIds.length) throw new FinanceServiceEvidenceSourceLimitError();
  if (bookingIds.length === 0) return new Map();
  const [bookings, resources, events] = await Promise.all([
    tx.$queryRaw<EvidenceRow[]>(Prisma.sql`SELECT id,"businessId","updatedAt","checkInDate","checkOutDate",status FROM "Booking" WHERE "businessId"=${businessId} AND id IN (${Prisma.join([...bookingIds])}) ORDER BY id LIMIT ${limit + 1}`),
    tx.$queryRaw<{ bookingId: string; resourceId: string }[]>(Prisma.sql`SELECT br."bookingId",br."resourceId" FROM "BookingResource" br JOIN "Booking" b ON b.id=br."bookingId" WHERE b."businessId"=${businessId} AND b.id IN (${Prisma.join([...bookingIds])}) ORDER BY br."bookingId",br."resourceId" LIMIT ${limit + 1}`),
    tx.$queryRaw<{ id: string; bookingId: string; type: string; details: Prisma.JsonValue; actorUserId: string | null }[]>(Prisma.sql`SELECT id,"bookingId",type,details,"actorUserId" FROM "BookingTimelineEvent" WHERE "businessId"=${businessId} AND "bookingId" IN (${Prisma.join([...bookingIds])}) AND type IN ('BOOKING_CHECKED_IN','BOOKING_CHECKED_OUT') ORDER BY "occurredAt" DESC,id DESC LIMIT ${limit + 1}`),
  ]);
  if (bookings.length + resources.length + events.length > limit) throw new FinanceServiceEvidenceSourceLimitError();
  return new Map(bookings.map(row => {
    const manual = (type: string, operation: string) => events.find(event => event.bookingId === row.id && event.type === type && event.actorUserId && event.details !== null && typeof event.details === 'object' && !Array.isArray(event.details) && event.details.source === 'MANUAL' && event.details.operation === operation)?.id ?? null;
    return [row.id, { businessId: row.businessId, bookingId: row.id, resourceIds: resources.filter(part => part.bookingId === row.id).map(part => part.resourceId), bookingUpdatedAt: row.updatedAt.toISOString(), checkInDate: row.checkInDate?.toISOString().slice(0, 10) ?? null, checkOutDate: row.checkOutDate?.toISOString().slice(0, 10) ?? null, status: row.status, checkInEventId: manual('BOOKING_CHECKED_IN', 'CHECK_IN'), checkOutEventId: manual('BOOKING_CHECKED_OUT', 'CHECK_OUT') }];
  }));
}
