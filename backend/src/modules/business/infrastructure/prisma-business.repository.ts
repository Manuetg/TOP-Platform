import { Injectable } from '@nestjs/common';
import type { Business as PrismaBusiness } from '@prisma/client';
import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository, type CreateBusinessData } from '../domain/business.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaBusinessRepository implements BusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBusinessData): Promise<Business> {
    const business = await this.prisma.business.create({ data });

    return this.toDomain(business);
  }

  async findById(id: string): Promise<Business | null> {
    const business = await this.prisma.business.findUnique({ where: { id } });

    return business ? this.toDomain(business) : null;
  }

  async list(): Promise<Business[]> {
    const businesses = await this.prisma.business.findMany({ orderBy: { createdAt: 'asc' } });

    return businesses.map((business) => this.toDomain(business));
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
