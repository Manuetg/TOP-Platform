import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/prisma-user.repository';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const isTestDatabase = databaseUrl ? new URL(databaseUrl).pathname.toLowerCase().includes('test') : false;

describeWithPostgres('PrismaUserRepository con PostgreSQL', () => {
  const prisma = new PrismaIdentityService();
  const repository = new PrismaUserRepository(prisma);
  beforeAll(async () => { if (!isTestDatabase) throw new Error('Las pruebas de integración de Identity requieren una DATABASE_URL cuyo nombre incluya "test".'); await prisma.$connect(); });
  beforeEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterAll(async () => { if (isTestDatabase) await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  it('persiste User ACTIVE y LocalCredential de forma uno a uno', async () => {
    const user = await repository.create({ email: 'user@example.com', passwordHash: 'hash-secreto' });
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { localCredential: true } });
    expect(user).toMatchObject({ email: 'user@example.com', status: 'ACTIVE' });
    expect(persisted.localCredential).toMatchObject({ userId: user.id, passwordHash: 'hash-secreto' });
  });
  it('consulta exactamente por email y respeta unicidad', async () => {
    await repository.create({ email: 'user@example.com', passwordHash: 'hash' });
    await expect(repository.findByEmail('user@example.com')).resolves.toMatchObject({ email: 'user@example.com' });
    await expect(repository.create({ email: 'user@example.com', passwordHash: 'hash' })).rejects.toThrow();
  });
});
