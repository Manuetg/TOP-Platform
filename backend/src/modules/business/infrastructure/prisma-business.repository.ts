import type { Business as PrismaBusiness, PrismaClient } from '@prisma/client';
import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository, type CreateBusinessData } from '../domain/business.repository';

export class PrismaBusinessRepository implements BusinessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateBusinessData): Promise<Business> {
    const business = await this.prisma.business.create({ data });

    return this.toDomain(business);
  }

  private toDomain(business: PrismaBusiness): Business {
    return Business.create({
      id: business.id,
      businessNumber: business.businessNumber,
      name: business.name,
      legalName: business.legalName,
      taxId: business.taxId,
      timezone: business.timezone,
      currency: business.currency,
      status: business.status as BusinessStatus,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    });
  }
}
