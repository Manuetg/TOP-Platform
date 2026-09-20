import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { ResourceStatus } from '../domain/resource-status.enum';
import type { ResourceSearchReader, ResourceSearchMatch } from '../application/resource-search.reader';
import { escapeLike } from '../../../shared/infrastructure/escape-like';

@Injectable()
export class PrismaResourceSearchReader implements ResourceSearchReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, query: string): Promise<ResourceSearchMatch[]> {
    const contains = escapeLike(query);
    const rows = await this.prisma.resource.findMany({
      where: { businessId, OR: [{ name: { contains, mode: 'insensitive' } }, { internalCode: { contains, mode: 'insensitive' } }] },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 6,
      select: { id: true, name: true, internalCode: true, status: true },
    });
    return rows.map((row) => ({ id: row.id, title: row.name, subtitle: row.internalCode || null, status: row.status as ResourceStatus }));
  }
}
