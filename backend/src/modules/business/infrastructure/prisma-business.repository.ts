import { Injectable } from '@nestjs/common';
import { Prisma, type Business as PrismaBusiness } from '@prisma/client';
import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository, type CreateBusinessData } from '../domain/business.repository';
import { PrismaService } from './prisma.service';
import { BusinessNotFoundError } from '../application/get-business-by-id.use-case';
import { BUSINESS_ARCHIVE_REASON, BUSINESS_PROFILE_UPDATE_REASON, BusinessChangeConflictError, BusinessChangeForbiddenError, BusinessTimezoneHistoryError, type BusinessChangeRepository, type BusinessProfileChange } from '../domain/business-change.repository';
import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';

@Injectable()
export class PrismaBusinessRepository implements BusinessRepository, BusinessChangeRepository {
  private readonly policy = new AuthorizationPolicy();
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBusinessData): Promise<Business> {
    const business = await this.prisma.business.create({ data });

    return this.toDomain(business);
  }

  async findById(id: string): Promise<Business | null> {
    const business = await this.prisma.business.findUnique({ where: { id } });

    return business ? this.toDomain(business) : null;
  }

  async list(userId: string): Promise<Business[]> {
    const businesses = await this.prisma.business.findMany({
      where: { status: 'ACTIVE', memberships: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });

    return businesses.map((business) => this.toDomain(business));
  }

  /** Compatibilidad interna: las mutations HTTP usan changeProfile/archive con autoridad y auditoría. */
  async update(business: Business): Promise<Business> {
    const updated = await this.prisma.business.update({
      where: { id: business.id },
      data: business.status === BusinessStatus.ARCHIVED ? { status: BusinessStatus.ARCHIVED } : {
        name: business.name,
        legalName: business.legalName,
        taxId: business.taxId,
        timezone: business.timezone,
        currency: business.currency,
      },
    });

    return this.toDomain(updated);
  }

  async changeProfile(input: BusinessProfileChange): Promise<Business> {
    const row = await this.prisma.$transaction(async (transaction) => {
      await this.assertAuthority(transaction, input.actorUserId, input.id, Capability.BUSINESS_UPDATE);
      const current = await this.lockBusiness(transaction, input.id);
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new BusinessChangeConflictError('El establecimiento cambió. Consultá los datos actuales antes de guardar.');
      }
      const { changes, beforeData, afterData } = this.profileChanges(current, input);
      if (Object.keys(changes).length === 0) return current;
      await this.assertTimezoneChangeAllowed(transaction, current, input);
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const updated = await transaction.business.update({ where: { id: input.id }, data: { ...changes, updatedAt } });
      await transaction.businessProfileAudit.create({ data: {
        businessId: input.id, actorUserId: input.actorUserId, occurredAt: updatedAt,
        beforeData, afterData, reason: BUSINESS_PROFILE_UPDATE_REASON,
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.toDomain(row);
  }

  async archive(input: { id: string; actorUserId: string }): Promise<Business> {
    const row = await this.prisma.$transaction(async (transaction) => {
      await this.assertAuthority(transaction, input.actorUserId, input.id, Capability.BUSINESS_ARCHIVE);
      const current = await this.lockBusiness(transaction, input.id);
      if (current.status === 'ARCHIVED') return current;
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const updated = await transaction.business.update({ where: { id: input.id }, data: { status: BusinessStatus.ARCHIVED, updatedAt } });
      await transaction.businessProfileAudit.create({ data: {
        businessId: input.id, actorUserId: input.actorUserId, occurredAt: updatedAt,
        beforeData: { status: current.status }, afterData: { status: BusinessStatus.ARCHIVED }, reason: BUSINESS_ARCHIVE_REASON,
      } });
      return updated;
    });
    return this.toDomain(row);
  }

  private async assertAuthority(transaction: Prisma.TransactionClient, actorUserId: string, businessId: string, capability: Capability): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorUserId} FOR SHARE`);
    const actor = await transaction.user.findUnique({ where: { id: actorUserId }, select: { status: true } });
    if (actor?.status !== 'ACTIVE') throw new BusinessChangeForbiddenError('Un usuario inactivo no puede modificar el establecimiento.');
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "UserBusinessMembership" WHERE "userId" = ${actorUserId} AND "businessId" = ${businessId} FOR SHARE`);
    const membership = await transaction.userBusinessMembership.findUnique({ where: { userId_businessId: { userId: actorUserId, businessId } }, select: { role: true } });
    if (!membership || !this.policy.isAllowed(membership.role as Parameters<AuthorizationPolicy['isAllowed']>[0], capability)) {
      throw new BusinessChangeForbiddenError('La membresía vigente no permite modificar este establecimiento.');
    }
  }

  private async lockBusiness(transaction: Prisma.TransactionClient, id: string): Promise<PrismaBusiness> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${id} FOR UPDATE`);
    const current = await transaction.business.findUnique({ where: { id } });
    if (!current) throw new BusinessNotFoundError('El negocio no existe.');
    return current;
  }

  private async assertTimezoneChangeAllowed(transaction: Prisma.TransactionClient, current: PrismaBusiness, input: BusinessProfileChange): Promise<void> {
    if (input.changes.timezone === undefined || input.changes.timezone === current.timezone) return;
    const [history] = await transaction.$queryRaw<Array<{ hasHistory: boolean }>>(Prisma.sql`
      SELECT (
        EXISTS (SELECT 1 FROM "Resource" WHERE "businessId" = ${input.id}) OR
        EXISTS (SELECT 1 FROM "Booking" WHERE "businessId" = ${input.id}) OR
        EXISTS (SELECT 1 FROM "Block" WHERE "businessId" = ${input.id}) OR
        EXISTS (SELECT 1 FROM "Payment" WHERE "businessId" = ${input.id})
      ) AS "hasHistory"
    `);
    if (!history || typeof history.hasHistory !== 'boolean') throw new Error('No se pudo verificar el historial del establecimiento.');
    if (history.hasHistory) throw new BusinessTimezoneHistoryError('No se puede cambiar la zona horaria de un establecimiento con recursos, reservas, bloqueos o pagos registrados. Conserva la zona horaria actual para guardar los demás datos.');
  }

  private profileChanges(current: PrismaBusiness, input: BusinessProfileChange) {
    const fields = ['name', 'legalName', 'taxId', 'country', 'region', 'city', 'address', 'timezone', 'currency'] as const;
    const changes: Prisma.BusinessUpdateInput = {};
    const beforeData: Record<string, string | null> = {};
    const afterData: Record<string, string | null> = {};
    for (const field of fields) {
      const value = input.changes[field];
      if (value === undefined || (current[field] ?? null) === value) continue;
      Object.assign(changes, { [field]: value });
      beforeData[field] = current[field] ?? null;
      afterData[field] = value;
    }
    return { changes, beforeData, afterData };
  }

  private toDomain(business: PrismaBusiness): Business {
    return Business.create({
      id: business.id,
      businessNumber: business.businessNumber,
      name: business.name,
      legalName: business.legalName,
      taxId: business.taxId,
      country: business.country,
      region: business.region,
      city: business.city,
      address: business.address,
      timezone: business.timezone,
      currency: business.currency,
      status: business.status as BusinessStatus,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    });
  }
}
