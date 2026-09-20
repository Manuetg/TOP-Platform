import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { ContactStatus } from '../domain/contact-status.enum';
import type { ContactSearchReader, ContactSearchMatch } from '../application/contact-search.reader';
import { escapeLike } from '../../../shared/infrastructure/escape-like';

@Injectable()
export class PrismaContactSearchReader implements ContactSearchReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, query: string): Promise<ContactSearchMatch[]> {
    const filter = { contains: escapeLike(query), mode: 'insensitive' as const };
    const rows = await this.prisma.contact.findMany({
      where: { businessId, OR: [{ name: filter }, { lastName: filter }, { phone: filter }, { whatsapp: filter }, { email: filter }, { documentNumber: filter }] },
      orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }], take: 6,
      select: { id: true, name: true, lastName: true, phone: true, whatsapp: true, email: true, status: true },
    });
    return rows.map((row) => ({
      id: row.id, title: [row.name, row.lastName].filter((part) => part !== null).join(' '),
      subtitle: [row.phone, row.whatsapp, row.email].find((value) => value?.trim()) ?? null,
      status: row.status as ContactStatus,
    }));
  }
}
