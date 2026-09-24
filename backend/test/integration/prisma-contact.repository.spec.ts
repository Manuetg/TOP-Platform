import { Contact } from '../../src/modules/contact/domain/contact.entity';
import { PrismaClient } from '@prisma/client';
import { ContactStatus } from '../../src/modules/contact/domain/contact-status.enum';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
describeWithPostgres('PrismaContactRepository', () => {
  const prisma = new PrismaClient(); const repository = new PrismaContactRepository(prisma);
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function business(name: string) { return prisma.business.create({ data: { name } }); }
  it('creates, reads, searches and updates a contact inside its business', async () => {
    const owner = await business('Owner');
    const created = await repository.create({ businessId: owner.id, name: 'María', lastName: 'López', phone: '0981123456', whatsapp: '0981123456', email: 'maria@example.com', documentType: 'CI', documentNumber: '123', country: 'Paraguay', city: 'Asunción' });
    await expect(repository.findByIdAndBusinessId(created.id, owner.id)).resolves.toMatchObject({ id: created.id, fullName: 'María López', status: ContactStatus.ACTIVE });
    await expect(repository.searchByBusinessId(owner.id, '123')).resolves.toHaveLength(1);
    await expect(repository.searchByBusinessId(owner.id, 'maria@example.com')).resolves.toHaveLength(1);
    const updated = created.update({ city: 'Encarnación', phone: null });
    await expect(repository.update(updated)).resolves.toMatchObject({ city: 'Encarnación', phone: null, businessId: owner.id });
  });
  it('keeps search and reads isolated by business across approved criteria', async () => {
    const owner = await business('Owner'); const other = await business('Other');
    const local = await repository.create({ businessId: owner.id, name: 'Ana', lastName: null, phone: '0981000', whatsapp: null, email: 'ana@example.com', documentType: 'CI', documentNumber: '456', country: null, city: null });
    await repository.create({ businessId: other.id, name: 'Ana', lastName: null, phone: '0981000', whatsapp: null, email: 'ana@example.com', documentType: 'CI', documentNumber: '456', country: null, city: null });
    for (const query of ['Ana', '0981000', 'ana@example.com', '456']) await expect(repository.searchByBusinessId(owner.id, query)).resolves.toEqual([expect.objectContaining({ id: local.id })]);
    await expect(repository.findByIdAndBusinessId(local.id, other.id)).resolves.toBeNull();
  });
  it.each([ContactStatus.ACTIVE, ContactStatus.INACTIVE])('archives %s concurrently once, preserving Booking and audit', async (status) => {
    const owner = await business('Owner'); const other = await business('Other');
    const actor = '11111111-1111-4111-8111-111111111111';
    const row = await prisma.contact.create({ data: { businessId: owner.id, name: 'Ana', phone: 'ambiguo histórico', status } });
    const booking = await prisma.booking.create({ data: { businessId: owner.id, contactId: row.id } });
    await expect(repository.archive(row.id, other.id, actor)).resolves.toBeNull();
    const results = await Promise.all([repository.archive(row.id, owner.id, actor), repository.archive(row.id, owner.id, actor)]);
    expect(results.every((item) => item?.status === ContactStatus.ARCHIVED)).toBe(true);
    const archived = await prisma.contact.findUniqueOrThrow({ where: { id: row.id } });
    expect(archived).toMatchObject({ archivedBy: actor, archivedAt: expect.any(Date), archivedFromStatus: status, phone: row.phone });
    await repository.archive(row.id, owner.id, '22222222-2222-4222-8222-222222222222');
    const repeated = await prisma.contact.findUniqueOrThrow({ where: { id: row.id } });
    expect(repeated).toEqual(archived);
    const stale = Contact.create({ ...row, status });
    await repository.update(stale.update({ city: 'Encarnación' }));
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: ContactStatus.ARCHIVED, archivedBy: actor });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ contactId: row.id });
  });

});
