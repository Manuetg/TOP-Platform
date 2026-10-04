import { Injectable } from '@nestjs/common';
import { Prisma, type Contact as PrismaContact } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Contact } from '../domain/contact.entity';
import { ContactStatus } from '../domain/contact-status.enum';
import type { ContactMessagingResolution, ContactMessagingResolutionInput, ContactMessagingSummary } from '../contact.contract';
import type { ContactRepository, CreateContactData } from '../domain/contact.repository';
import { ContactNotFoundError } from '../application/contact.errors';

@Injectable()
export class PrismaContactRepository implements ContactRepository, ContactMessagingResolution {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: CreateContactData): Promise<Contact> { return this.map(await this.prisma.contact.create({ data })); }
  async findByIdAndBusinessId(id: string, businessId: string): Promise<Contact | null> { const row = await this.prisma.contact.findFirst({ where: { id, businessId } }); return row ? this.map(row) : null; }
  async findByMessagingAddressAndBusinessId(address: string, businessId: string): Promise<Contact | null> {
    const row = await this.prisma.contact.findFirst({ where: { businessId, OR: [{ whatsapp: address }, { phone: address }] }, orderBy: { id: 'asc' } });
    return row ? this.map(row) : null;
  }
  async findSummariesByIdsAndBusinessId(ids: string[], businessId: string): Promise<ContactMessagingSummary[]> {
    if (ids.length === 0) return [];
    return this.prisma.contact.findMany({ where: { businessId, id: { in: ids } }, select: { id: true, businessId: true, name: true, lastName: true, phone: true, whatsapp: true } });
  }
  async resolveOrCreateInTransaction(input: ContactMessagingResolutionInput): Promise<Contact> {
    const client = input.transaction as Prisma.TransactionClient;
    await client.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.businessId}|${input.address}`}, 0))`);
    if (input.existingContactId) {
      const existing = await client.contact.findFirst({ where: { id: input.existingContactId, businessId: input.businessId } });
      if (!existing) throw new ContactNotFoundError('El contacto no existe.');
      return this.map(existing);
    }
    const matching = await client.contact.findFirst({ where: { businessId: input.businessId, OR: [{ whatsapp: input.address }, { phone: input.address }] }, orderBy: { id: 'asc' } });
    if (matching) return this.map(matching);
    return this.map(await client.contact.create({ data: { businessId: input.businessId, name: input.name, lastName: null, phone: input.address, whatsapp: input.address, email: null, documentType: null, documentNumber: null, country: null, city: null } }));
  }
  async searchByBusinessId(businessId: string, query: string | null): Promise<Contact[]> {
    const where = query === null ? { businessId } : { businessId, OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { lastName: { contains: query, mode: 'insensitive' as const } }, { phone: { contains: query, mode: 'insensitive' as const } }, { whatsapp: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }, { documentNumber: { contains: query, mode: 'insensitive' as const } }] };
    return (await this.prisma.contact.findMany({ where, orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }] })).map((row) => this.map(row));
  }
  async update(contact: Contact): Promise<Contact> { return this.map(await this.prisma.contact.update({ where: { id: contact.id, businessId: contact.businessId }, data: { name: contact.name, lastName: contact.lastName, phone: contact.phone, whatsapp: contact.whatsapp, email: contact.email, documentType: contact.documentType, documentNumber: contact.documentNumber, country: contact.country, city: contact.city } })); }
  async archive(id: string, businessId: string, actorUserId: string): Promise<Contact | null> {
    // El predicado hace que concurrentes/reintentos conserven la primera auditoría.
    return this.prisma.$transaction(async (tx) => {
      for (const status of [ContactStatus.ACTIVE, ContactStatus.INACTIVE]) {
        await tx.contact.updateMany({ where: { id, businessId, status }, data: {
          status: ContactStatus.ARCHIVED, archivedAt: new Date(), archivedBy: actorUserId, archivedFromStatus: status,
        } });
      }
      const row = await tx.contact.findFirst({ where: { id, businessId } });
      return row ? this.map(row) : null;
    });
  }
  private map(row: PrismaContact): Contact { return Contact.create({ ...row, status: row.status as ContactStatus }); }
}
