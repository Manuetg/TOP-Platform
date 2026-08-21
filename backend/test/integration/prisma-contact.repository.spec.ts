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
});
