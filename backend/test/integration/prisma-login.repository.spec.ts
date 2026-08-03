import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { PrismaMembershipRepository } from '../../src/modules/identity/infrastructure/prisma-membership.repository';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/prisma-user.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Persistencia de Login con PostgreSQL', () => {
  const prisma = new PrismaIdentityService();
  const users = new PrismaUserRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);

  beforeAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$connect();
  });

  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });

  it('obtiene User ACTIVE y LocalCredential por email', async () => {
    const user = await prisma.user.create({ data: { email: 'active@example.com', status: UserStatus.ACTIVE } });
    await prisma.localCredential.create({ data: { userId: user.id, passwordHash: 'hash-active' } });
    await expect(users.findForLoginByEmail('active@example.com')).resolves.toMatchObject({ user: { id: user.id, status: UserStatus.ACTIVE }, passwordHash: 'hash-active' });
  });

  it('conserva el estado DISABLED para que Login lo rechace', async () => {
    const user = await prisma.user.create({ data: { email: 'disabled@example.com', status: UserStatus.DISABLED } });
    await prisma.localCredential.create({ data: { userId: user.id, passwordHash: 'hash-disabled' } });
    await expect(users.findForLoginByEmail('disabled@example.com')).resolves.toMatchObject({ user: { status: UserStatus.DISABLED } });
  });

  it('retorna membresías vacías y ordena múltiples membresías', async () => {
    const user = await prisma.user.create({ data: { email: 'memberships@example.com' } });
    await prisma.localCredential.create({ data: { userId: user.id, passwordHash: 'hash' } });
    await expect(memberships.findByUserId(user.id)).resolves.toEqual([]);
    const first = await prisma.business.create({ data: { name: 'Business A' } });
    const second = await prisma.business.create({ data: { name: 'Business B' } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: second.id, role: MembershipRole.VIEWER, createdAt: new Date('2026-01-02') } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: first.id, role: MembershipRole.OWNER, createdAt: new Date('2026-01-01') } });
    await expect(memberships.findByUserId(user.id)).resolves.toMatchObject([{ businessId: first.id, role: MembershipRole.OWNER }, { businessId: second.id, role: MembershipRole.VIEWER }]);
  });
});
