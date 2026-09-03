import { Injectable } from '@nestjs/common';
import type { Amenity as PrismaAmenity, Prisma } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Amenity } from '../domain/amenity.entity';
import type { AmenityRepository } from '../domain/amenity.repository';
import type { BusinessAmenityRepository } from '../domain/business-amenity.repository';

@Injectable()
export class PrismaAmenityRepository implements AmenityRepository, BusinessAmenityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { active: true, businessId: null }, orderBy: this.order });
    return rows.map((row) => this.map(row));
  }

  async listActiveForBusiness(businessId: string): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { active: true, OR: [{ businessId: null }, { businessId }] }, orderBy: this.order });
    return rows.map((row) => this.map(row));
  }

  async findManyByIds(ids: string[]): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { id: { in: ids } }, orderBy: this.order });
    return rows.map((row) => this.map(row));
  }

  async findManyAssignableToBusiness(ids: string[], businessId: string): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { id: { in: ids }, OR: [{ businessId: null }, { businessId }] }, orderBy: this.order });
    return rows.map((row) => this.map(row));
  }

  async create(amenity: Amenity): Promise<Amenity> {
    const row = await this.prisma.amenity.create({ data: { id: amenity.id, businessId: amenity.businessId, code: amenity.code, name: amenity.name, category: amenity.category, active: amenity.active, sortOrder: amenity.sortOrder, createdAt: amenity.createdAt, updatedAt: amenity.updatedAt } });
    return this.map(row);
  }

  private readonly order: Prisma.AmenityOrderByWithRelationInput[] = [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }];
  private map(row: PrismaAmenity): Amenity { return Amenity.create({ ...row, businessId: row.businessId, category: row.category }); }
}
