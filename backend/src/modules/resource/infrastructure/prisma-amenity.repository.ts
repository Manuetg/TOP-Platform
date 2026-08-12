import { Injectable } from '@nestjs/common';
import type { Amenity as PrismaAmenity } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Amenity } from '../domain/amenity.entity';
import type { AmenityRepository } from '../domain/amenity.repository';

@Injectable()
export class PrismaAmenityRepository implements AmenityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
    return rows.map((row) => this.map(row));
  }

  async findManyByIds(ids: string[]): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({ where: { id: { in: ids } }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
    return rows.map((row) => this.map(row));
  }

  private map(row: PrismaAmenity): Amenity { return Amenity.create({ ...row, category: row.category }); }
}
