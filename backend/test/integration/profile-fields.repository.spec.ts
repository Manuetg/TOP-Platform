import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GetUserProfileUseCase } from '../../src/modules/identity/application/get-user-profile.use-case';
import { UpdateUserProfileUseCase } from '../../src/modules/identity/application/update-user-profile.use-case';
import { UserProfileConflictError } from '../../src/modules/identity/application/user-profile.errors';
import { USER_PROFILE_UPDATE_REASON } from '../../src/modules/identity/domain/user-profile-change.repository';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/prisma-user.repository';
import { assertTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Campos opcionales de perfil con PostgreSQL', () => {
  const prisma = new PrismaIdentityService();
  const repository = new PrismaUserRepository(prisma);
  const updateProfile = new UpdateUserProfileUseCase(new GetUserProfileUseCase(repository), repository);
  const userIds: string[] = [];
  const cleanOwnData = async (): Promise<void> => {
    if (!userIds.length) return;
    const where = { userId: { in: userIds } };
    await prisma.userProfileAudit.deleteMany({ where });
    await prisma.userDisplayNameAudit.deleteMany({ where });
    await prisma.refreshSession.deleteMany({ where });
    await prisma.localCredential.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
  };
  const createProfile = async () => {
    const user = await prisma.user.create({ data: { email: `profile-${randomUUID()}@example.test`, displayName: 'Perfil de prueba', emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z') } });
    userIds.push(user.id);
    return user;
  };

  beforeAll(async () => { assertTestDatabase(databaseUrl); await prisma.$connect(); });
  afterEach(cleanOwnData);
  afterAll(async () => { if (databaseUrl?.includes('test')) await cleanOwnData(); await prisma.$disconnect(); });

  it('normaliza y audita solo campos modificados sin cambiar credenciales, verificación o sesiones', async () => {
    const user = await createProfile();
    await prisma.localCredential.create({ data: { userId: user.id, passwordHash: 'hash-sintetico' } });
    await prisma.refreshSession.create({ data: { userId: user.id, tokenHash: `session-${randomUUID()}`, expiresAt: new Date('2030-01-01') } });
    const include = { localCredential: true, refreshSessions: true } as const;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include });

    const updated = await updateProfile.execute({
      id: user.id, actorUserId: user.id, displayName: user.displayName,
      birthYear: 1990, username: '  Alias de prueba  ', phone: '+595 981 123456', avatarId: 'leaf',
      expectedUpdatedAt: user.updatedAt.toISOString(),
    });

    const fields = { birthYear: 1990, username: 'Alias de prueba', phone: '+595981123456', avatarId: 'leaf' };
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id }, include })).resolves.toEqual({ ...before, ...fields, updatedAt: updated.updatedAt });
    await expect(prisma.userProfileAudit.findMany({ where: { userId: user.id } })).resolves.toEqual([{
      id: expect.any(String), userId: user.id, actorUserId: user.id, occurredAt: updated.updatedAt,
      beforeData: { birthYear: null, username: null, phone: null, avatarId: null }, afterData: fields, reason: USER_PROFILE_UPDATE_REASON,
    }]);
    await expect(prisma.userDisplayNameAudit.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('preserva omisiones, borra null explícito y conserva la versión en no-op completo', async () => {
    const user = await createProfile();
    const first = await updateProfile.execute({ id: user.id, actorUserId: user.id, displayName: user.displayName, birthYear: 1980, username: 'Alias', phone: '+595981123456', avatarId: 'sun', expectedUpdatedAt: user.updatedAt.toISOString() });
    const second = await updateProfile.execute({ id: user.id, actorUserId: user.id, displayName: user.displayName, username: null, expectedUpdatedAt: first.updatedAt.toISOString() });
    expect(second).toMatchObject({ birthYear: 1980, username: null, phone: '+595981123456', avatarId: 'sun' });
    const history = await prisma.userProfileAudit.findMany({ where: { userId: user.id }, orderBy: { occurredAt: 'asc' } });
    expect(history[1]).toMatchObject({ beforeData: { username: 'Alias' }, afterData: { username: null }, reason: USER_PROFILE_UPDATE_REASON });

    const noOp = await updateProfile.execute({ id: user.id, actorUserId: user.id, displayName: user.displayName, birthYear: 1980, username: null, phone: '+595 981 123456', avatarId: 'sun', expectedUpdatedAt: second.updatedAt.toISOString() });
    expect(noOp.updatedAt).toEqual(second.updatedAt);
    await expect(prisma.userProfileAudit.findMany({ where: { userId: user.id }, orderBy: { occurredAt: 'asc' } })).resolves.toEqual(history);
  });

  it('una versión compartida permite solo una actualización concurrente aunque el nombre no cambie', async () => {
    const user = await createProfile();
    const attempts = await Promise.allSettled(['leaf', 'mountain'].map((avatarId) => updateProfile.execute({
      id: user.id, actorUserId: user.id, displayName: user.displayName, avatarId, expectedUpdatedAt: user.updatedAt.toISOString(),
    })));
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const loser = attempts.find((attempt) => attempt.status === 'rejected');
    expect(loser?.reason).toBeInstanceOf(UserProfileConflictError);
    await expect(prisma.userProfileAudit.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.userDisplayNameAudit.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('el fallo de auditoría general revierte los campos y versión en la base real', async () => {
    const user = await createProfile();

    await expect(repository.changeDisplayName({
      id: user.id, actorUserId: user.id, displayName: user.displayName!, birthYear: 1990,
      reason: null as unknown as string, expectedUpdatedAt: user.updatedAt,
    })).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);

    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(user);
    await expect(prisma.userProfileAudit.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.userDisplayNameAudit.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('las FK preservan el historial de perfil y el histórico anterior del nombre', async () => {
    const user = await createProfile();
    const previous = await prisma.userDisplayNameAudit.create({ data: { userId: user.id, actorUserId: user.id, beforeName: null, afterName: user.displayName!, reason: 'Historial sintético anterior' } });
    await updateProfile.execute({ id: user.id, actorUserId: user.id, displayName: user.displayName, avatarId: 'sun', expectedUpdatedAt: user.updatedAt.toISOString() });

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.userDisplayNameAudit.findUnique({ where: { id: previous.id } })).resolves.toEqual(previous);
    await expect(prisma.userProfileAudit.count({ where: { userId: user.id } })).resolves.toBe(1);
  });
});
