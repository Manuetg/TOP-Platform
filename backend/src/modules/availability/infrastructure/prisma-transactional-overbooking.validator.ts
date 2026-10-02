import { Prisma } from '@prisma/client';
import type { OverbookingValidationInput, OverbookingValidationResult } from '../availability.contract';
import { deriveAvailability } from '../application/availability.derivation';
import { assertAvailabilityUuid, parseAvailabilityDate } from '../application/availability.validation';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError, InvalidAvailabilityInputError } from '../application/availability.errors';
import { DEFAULT_AVAILABILITY_RULES, type AvailabilityRules } from '../domain/availability-rules.repository';
import { ResourceStatus } from '../../resource/resource.contract';

function range(input: OverbookingValidationInput): { from: Date; to: Date } {
  assertAvailabilityUuid(input.businessId);
  if (input.excludeBookingId !== undefined) assertAvailabilityUuid(input.excludeBookingId);
  if (!Array.isArray(input.resourceIds) || input.resourceIds.length === 0 || new Set(input.resourceIds).size !== input.resourceIds.length) {
    throw new InvalidAvailabilityInputError('Debe informar recursos únicos.');
  }
  input.resourceIds.forEach(assertAvailabilityUuid);
  const from = parseAvailabilityDate(input.checkInDate, 'La fecha inicial');
  const to = parseAvailabilityDate(input.checkOutDate, 'La fecha final');
  if (to <= from) throw new InvalidAvailabilityInputError('La fecha final debe ser posterior a la fecha inicial.');
  return { from, to };
}

async function requireActiveBusiness(transaction: Prisma.TransactionClient, businessId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR SHARE`);
  const business = await transaction.business.findUnique({ where: { id: businessId }, select: { status: true } });
  if (!business) throw new AvailabilityBusinessNotFoundError('El negocio no existe.');
  if (business.status !== 'ACTIVE') throw new AvailabilityBusinessUnavailableError('El negocio no está activo.');
}

async function resourceConflict(
  transaction: Prisma.TransactionClient,
  input: OverbookingValidationInput,
  resourceId: string,
  dates: { from: Date; to: Date },
  rules: Omit<AvailabilityRules, 'businessId'>,
): Promise<OverbookingValidationResult['conflicts'][number] | null> {
  await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Resource" WHERE "id" = ${resourceId} AND "businessId" = ${input.businessId} FOR SHARE`);
  const resource = await transaction.resource.findFirst({ where: { id: resourceId, businessId: input.businessId }, select: { status: true } });
  if (!resource) throw new AvailabilityResourceNotFoundError('El recurso no existe.');
  const shortCircuit = deriveAvailability(resource.status as ResourceStatus, false, false);
  if (shortCircuit.reasons.length) return { resourceId, reasons: shortCircuit.reasons };
  const statuses: Array<'PENDING' | 'CONFIRMED' | 'IN_PROGRESS'> = rules.pendingBlocksAvailability
    ? ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] : ['CONFIRMED', 'IN_PROGRESS'];
  const bookingFrom = new Date(dates.from.getTime() - rules.bufferAfterDays * 86_400_000);
  const bookingTo = new Date(dates.to.getTime() + rules.bufferBeforeDays * 86_400_000);
  const [booking, block] = await Promise.all([
    transaction.booking.findFirst({ where: {
      businessId: input.businessId,
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      status: { in: statuses }, resources: { some: { resourceId } },
      checkInDate: { lt: bookingTo }, checkOutDate: { gt: bookingFrom },
    }, select: { id: true } }),
    transaction.block.findFirst({ where: {
      businessId: input.businessId, resourceId, status: 'SCHEDULED',
      startsAt: { lt: dates.to }, endsAt: { gt: dates.from },
    }, select: { id: true } }),
  ]);
  const result = deriveAvailability(resource.status as ResourceStatus, booking !== null, block !== null);
  return result.reasons.length ? { resourceId, reasons: result.reasons } : null;
}

/** Reads availability through the same transaction that persists the blocking state. */
export async function validateAvailabilityInTransaction(
  context: unknown,
  input: OverbookingValidationInput,
): Promise<OverbookingValidationResult> {
  const transaction = context as Prisma.TransactionClient;
  const dates = range(input);
  await requireActiveBusiness(transaction, input.businessId);
  const rules = (await transaction.availabilityRule.findUnique({ where: { businessId: input.businessId } })) ?? DEFAULT_AVAILABILITY_RULES;
  const conflicts: OverbookingValidationResult['conflicts'] = [];
  for (const resourceId of [...input.resourceIds].sort()) {
    const conflict = await resourceConflict(transaction, input, resourceId, dates, rules);
    if (conflict) conflicts.push(conflict);
  }
  return { valid: conflicts.length === 0, conflicts };
}
