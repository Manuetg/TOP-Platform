import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { PrismaRefreshSessionRepository } from '../../src/modules/identity/infrastructure/prisma-refresh-session.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Persistencia de RefreshSession con PostgreSQL', () => {
  const prisma = new PrismaIdentityService();
  const repository = new PrismaRefreshSessionRepository(prisma);

  beforeAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$connect(); });
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });

  it('persiste una sesión sin almacenar el token plano y rota atómicamente', async () => {
    const user = await prisma.user.create({ data: { email: 'refresh@example.com' } });
    const expiresAt = new Date('2027-01-01');
    const initial = await repository.create({ userId: user.id, tokenHash: 'initial-hash', expiresAt });
    await expect(repository.findByTokenHash('initial-hash')).resolves.toMatchObject({ id: initial.id, userId: user.id, tokenHash: 'initial-hash', expiresAt, revokedAt: null });
    await repository.rotate(initial.id, { userId: user.id, tokenHash: 'next-hash', expiresAt }, new Date('2026-08-04'));
    await expect(repository.findByTokenHash('initial-hash')).resolves.toMatchObject({ revokedAt: new Date('2026-08-04') });
    await expect(repository.findByTokenHash('next-hash')).resolves.toMatchObject({ userId: user.id, tokenHash: 'next-hash', revokedAt: null });
  });

  it('permite múltiples sesiones por User y conserva unicidad de tokenHash', async () => {
    const user = await prisma.user.create({ data: { email: 'multiple-refresh@example.com' } });
    await repository.create({ userId: user.id, tokenHash: 'hash-one', expiresAt: new Date('2027-01-01') });
    await repository.create({ userId: user.id, tokenHash: 'hash-two', expiresAt: new Date('2027-01-02') });
    await expect(repository.create({ userId: user.id, tokenHash: 'hash-one', expiresAt: new Date('2027-01-03') })).rejects.toThrow();
  });
});
