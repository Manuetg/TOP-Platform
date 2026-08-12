import { Injectable } from '@nestjs/common';
import type { Amenity as PrismaAmenity } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Amenity } from '../domain/amenity.entity';
import type { ResourceAmenityRepository } from '../domain/resource-amenity.repository';

@Injectable()
export class PrismaResourceAmenityRepository implements ResourceAmenityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replace(resourceId: string, amenityIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.resourceAmenity.deleteMany({ where: { resourceId } });
      if (amenityIds.length > 0) await tx.resourceAmenity.createMany({ data: amenityIds.map((amenityId) => ({ resourceId, amenityId })) });
    });
  }

  async listByResourceId(resourceId: string): Promise<Amenity[]> {
    const rows = await this.prisma.resourceAmenity.findMany({ where: { resourceId }, include: { amenity: true }, orderBy: [{ amenity: { category: 'asc' } }, { amenity: { sortOrder: 'asc' } }, { amenity: { name: 'asc' } }, { amenityId: 'asc' }] });
    return rows.map((row) => this.map(row.amenity));
  }

  private map(row: PrismaAmenity): Amenity { return Amenity.create({ ...row, category: row.category }); }
}
