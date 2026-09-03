import { Injectable } from '@nestjs/common';
import type { ResourceImage as PrismaResourceImage } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { ResourceImage } from '../domain/resource-image.entity';
import type { ResourceImageRepository } from '../domain/resource-image.repository';

@Injectable()
export class PrismaResourceImageRepository implements ResourceImageRepository {
  constructor(private readonly prisma: PrismaService) {}
  countByResourceId(resourceId: string): Promise<number> { return this.prisma.resourceImage.count({ where: { resourceId } }); }
  async getNextSortOrder(resourceId: string): Promise<number> { const result = await this.prisma.resourceImage.aggregate({ where: { resourceId }, _max: { sortOrder: true } }); return (result._max.sortOrder ?? -1) + 1; }
  async create(image: ResourceImage): Promise<ResourceImage> { return this.map(await this.prisma.resourceImage.create({ data: { id: image.id, businessId: image.businessId, resourceId: image.resourceId, storageKey: image.storageKey, mimeType: image.mimeType, sizeBytes: image.sizeBytes, sortOrder: image.sortOrder } })); }
  async listByResourceId(resourceId: string): Promise<ResourceImage[]> { return (await this.prisma.resourceImage.findMany({ where: { resourceId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).map((row) => this.map(row)); }
  private map(row: PrismaResourceImage): ResourceImage { return ResourceImage.create(row); }
}
