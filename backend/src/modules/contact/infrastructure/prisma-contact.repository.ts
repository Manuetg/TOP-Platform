import { Injectable } from '@nestjs/common';
import type { Contact as PrismaContact } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Contact } from '../domain/contact.entity';
import { ContactStatus } from '../domain/contact-status.enum';
import type { ContactRepository, CreateContactData } from '../domain/contact.repository';

@Injectable()
export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: CreateContactData): Promise<Contact> { return this.map(await this.prisma.contact.create({ data })); }
  async findByIdAndBusinessId(id: string, businessId: string): Promise<Contact | null> { const row = await this.prisma.contact.findFirst({ where: { id, businessId } }); return row ? this.map(row) : null; }
  async searchByBusinessId(businessId: string, query: string | null): Promise<Contact[]> {
    const where = query === null ? { businessId } : { businessId, OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { lastName: { contains: query, mode: 'insensitive' as const } }, { phone: { contains: query, mode: 'insensitive' as const } }, { whatsapp: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }, { documentNumber: { contains: query, mode: 'insensitive' as const } }] };
    return (await this.prisma.contact.findMany({ where, orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }] })).map((row) => this.map(row));
  }
  async update(contact: Contact): Promise<Contact> { return this.map(await this.prisma.contact.update({ where: { id: contact.id }, data: { name: contact.name, lastName: contact.lastName, phone: contact.phone, whatsapp: contact.whatsapp, email: contact.email, documentType: contact.documentType, documentNumber: contact.documentNumber, country: contact.country, city: contact.city, status: contact.status } })); }
  private map(row: PrismaContact): Contact { return Contact.create({ ...row, status: row.status as ContactStatus }); }
}
