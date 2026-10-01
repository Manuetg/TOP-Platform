import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/prisma-user.repository';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { cleanTestDatabase } from './support/clean-test-database';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { UserEmailConflictError } from '../../src/modules/identity/domain/user.repository';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileNotFoundError } from '../../src/modules/identity/application/user-profile.errors';
import { GetUserProfileUseCase } from '../../src/modules/identity/application/get-user-profile.use-case';
import { UpdateUserProfileUseCase } from '../../src/modules/identity/application/update-user-profile.use-case';

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

  it('deshabilita y conserva credencial, membresía y sesiones históricas', async () => {
    const user = await repository.create({ email: 'disable@example.com', passwordHash: 'hash-secreto' });
    const business = await prisma.business.create({ data: { name: 'Business integration disable' } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role: 'OWNER' } });
    await prisma.refreshSession.create({ data: { userId: user.id, tokenHash: 'session-disable', expiresAt: new Date('2027-01-01') } });

    const updated = await repository.update(user.disable());
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { localCredential: true, memberships: true, refreshSessions: true } });

    expect(updated.status).toBe(UserStatus.DISABLED);
    expect(updated.email).toBe('disable@example.com');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(user.updatedAt.getTime());
    expect(persisted).toMatchObject({ id: user.id, email: user.email, status: UserStatus.DISABLED });
    expect(persisted.localCredential?.passwordHash).toBe('hash-secreto');
    expect(persisted.memberships).toHaveLength(1);
    expect(persisted.refreshSessions).toHaveLength(1);
  });

  it('no encuentra usuarios inexistentes', async () => {
    await expect(repository.findById('11111111-1111-4111-8111-111111111111')).resolves.toBeNull();
  });

  it('actualiza solo email y conserva credencial, estado, Membership y sesión', async () => {
    const user = await repository.create({ email: 'before@example.com', passwordHash: 'hash-secreto' });
    const business = await prisma.business.create({ data: { name: 'Business update user' } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role: 'VIEWER' } });
    await prisma.refreshSession.create({ data: { userId: user.id, tokenHash: 'session-update-user', expiresAt: new Date('2027-01-01') } });
    await repository.updateEmail(user.updateEmail('after@example.com'));
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { localCredential: true, memberships: true, refreshSessions: true } });
    expect(persisted).toMatchObject({ email: 'after@example.com', status: UserStatus.ACTIVE });
    expect(persisted.localCredential?.passwordHash).toBe('hash-secreto');
    expect(persisted.memberships).toHaveLength(1);
    expect(persisted.refreshSessions).toHaveLength(1);
  });

  it('usa la constraint PostgreSQL como autoridad final del email único', async () => {
    const first = await repository.create({ email: 'first-update@example.com', passwordHash: 'hash' });
    await repository.create({ email: 'taken-update@example.com', passwordHash: 'hash' });
    await expect(repository.updateEmail(first.updateEmail('taken-update@example.com'))).rejects.toBeInstanceOf(UserEmailConflictError);
    await expect(repository.findById(first.id)).resolves.toMatchObject({ email: 'first-update@example.com' });
  });

  describe('cambio auditado del nombre personal', () => {
    it('registra actor, instante, motivo y nombres exactos desde legacy null sin reemplazar historial', async () => {
      const user = await repository.create({ email: 'profile-history@example.com', passwordHash: 'hash' });
      const first = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'María López',
        reason: 'Completar nombre personal', expectedUpdatedAt: user.updatedAt,
      });
      const firstHistory = await prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } });
      expect(firstHistory).toEqual([{
        id: expect.any(String), userId: user.id, actorUserId: user.id,
        occurredAt: first.updatedAt, beforeName: null, afterName: 'María López', reason: 'Completar nombre personal',
      }]);

      const second = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'María Gómez',
        reason: 'Corregir apellido', expectedUpdatedAt: first.updatedAt,
      });
      const history = await prisma.userDisplayNameAudit.findMany({
        where: { userId: user.id }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      expect(history).toEqual([firstHistory[0], {
        id: expect.any(String), userId: user.id, actorUserId: user.id,
        occurredAt: second.updatedAt, beforeName: 'María López', afterName: 'María Gómez', reason: 'Corregir apellido',
      }]);
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
        displayName: 'María Gómez', updatedAt: second.updatedAt,
      });
    });

    it('cambia solo nombre y versión conservando identidad, credencial, membresías, sesiones y tokens', async () => {
      const user = await repository.create({ email: 'profile-protected@example.com', passwordHash: 'hash-protegido' });
      const verifiedAt = new Date('2026-09-01T10:00:00.000Z');
      await prisma.user.update({ where: { id: user.id }, data: { displayName: 'Nombre anterior', emailVerifiedAt: verifiedAt } });
      const business = await prisma.business.create({ data: { name: 'Business perfil protegido' } });
      await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role: 'VIEWER' } });
      await prisma.refreshSession.create({ data: { userId: user.id, tokenHash: 'profile-live-session', expiresAt: new Date('2030-01-01') } });
      await prisma.refreshSession.create({ data: {
        userId: user.id, tokenHash: 'profile-historical-session', expiresAt: new Date('2030-01-01'), revokedAt: verifiedAt,
      } });
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: 'profile-reset-token', expiresAt: new Date('2030-01-01') } });
      await prisma.passwordResetChallenge.create({ data: {
        userId: user.id, codeDigest: 'profile-otp-digest', expiresAt: new Date('2030-01-01'), lastSentAt: verifiedAt, attempts: 2,
      } });
      await prisma.emailVerificationToken.create({ data: {
        userId: user.id, tokenHash: 'profile-verification-token', expiresAt: new Date('2030-01-01'), usedAt: verifiedAt,
      } });
      const include = {
        localCredential: true, memberships: true, refreshSessions: { orderBy: { id: 'asc' } },
        passwordResetTokens: true, passwordResetChallenges: true, emailVerificationTokens: true,
      } as const;
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include });

      const updated = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre corregido',
        reason: 'Corrección personal', expectedUpdatedAt: before.updatedAt,
      });

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include });
      expect(after).toEqual({ ...before, displayName: 'Nombre corregido', updatedAt: updated.updatedAt });
      expect(updated).toMatchObject({
        id: before.id, email: before.email, displayName: 'Nombre corregido',
        emailVerifiedAt: verifiedAt, status: UserStatus.ACTIVE, createdAt: before.createdAt, updatedAt: after.updatedAt,
      });
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      await expect(prisma.userDisplayNameAudit.count({ where: { userId: user.id } })).resolves.toBe(1);
    });

    it('un nombre idéntico con versión vigente conserva la versión y no agrega auditoría', async () => {
      const user = await repository.create({ email: 'profile-noop@example.com', passwordHash: 'hash' });
      const current = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre vigente',
        reason: 'Completar nombre', expectedUpdatedAt: user.updatedAt,
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const history = await prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } });

      const unchanged = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre vigente',
        reason: 'Reintento sin cambios', expectedUpdatedAt: current.updatedAt,
      });

      expect(unchanged.displayName).toBe(current.displayName);
      expect(unchanged.updatedAt).toEqual(current.updatedAt);
      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual(history);
    });

    it.each(['Nombre desactualizado', 'Nombre vigente'])('rechaza una versión obsoleta incluso para el nombre %s', async (displayName) => {
      const user = await repository.create({ email: 'profile-stale@example.com', passwordHash: 'hash' });
      await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre vigente',
        reason: 'Cambio confirmado', expectedUpdatedAt: user.updatedAt,
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const history = await prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } });

      await expect(repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName,
        reason: 'Formulario desactualizado', expectedUpdatedAt: user.updatedAt,
      })).rejects.toBeInstanceOf(UserProfileConflictError);

      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual(history);
    });

    it('avanza la versión al menos un milisegundo cuando la versión anterior supera al reloj', async () => {
      const user = await prisma.user.create({ data: {
        email: 'profile-monotonic@example.com', displayName: 'Nombre anterior', updatedAt: new Date('2099-01-01T00:00:00.000Z'),
      } });
      const updated = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre nuevo',
        reason: 'Corrección personal', expectedUpdatedAt: user.updatedAt,
      });

      expect(updated.updatedAt.getTime()).toBe(user.updatedAt.getTime() + 1);
      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({ updatedAt: updated.updatedAt });
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual([{
        id: expect.any(String), userId: user.id, actorUserId: user.id, occurredAt: updated.updatedAt,
        beforeName: 'Nombre anterior', afterName: 'Nombre nuevo', reason: 'Corrección personal',
      }]);
    });

    it('serializa dos cambios con la misma versión en un éxito y un conflicto sin duplicar historial', async () => {
      const user = await repository.create({ email: 'profile-concurrent@example.com', passwordHash: 'hash' });
      const attempts = await Promise.allSettled(['Nombre A', 'Nombre B'].map((displayName) => repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName,
        reason: 'Corrección concurrente', expectedUpdatedAt: user.updatedAt,
      })));
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
      const winner = attempts.find((attempt) => attempt.status === 'fulfilled');
      const loser = attempts.find((attempt) => attempt.status === 'rejected');
      if (!winner || !loser) throw new Error('Se esperaba un cambio confirmado y un conflicto.');
      expect(loser.reason).toBeInstanceOf(UserProfileConflictError);
      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(persisted).toMatchObject({ displayName: winner.value.displayName, updatedAt: winner.value.updatedAt });
      expect(persisted.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual([{
        id: expect.any(String), userId: user.id, actorUserId: user.id, occurredAt: persisted.updatedAt,
        beforeName: null, afterName: winner.value.displayName, reason: 'Corrección concurrente',
      }]);
    });

    it('revierte nombre y versión si falla la auditoría y conserva el historial confirmado', async () => {
      const user = await repository.create({ email: 'profile-rollback@example.com', passwordHash: 'hash' });
      const current = await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre confirmado',
        reason: 'Cambio previo válido', expectedUpdatedAt: user.updatedAt,
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const history = await prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } });

      await expect(repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre que no debe persistir',
        reason: null as unknown as string, expectedUpdatedAt: current.updatedAt,
      })).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);

      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual(history);
    });

    it('rechaza otro actor sin modificar ninguna identidad ni agregar auditoría', async () => {
      const user = await repository.create({ email: 'profile-self@example.com', passwordHash: 'hash' });
      const other = await repository.create({ email: 'profile-other@example.com', passwordHash: 'otro-hash' });
      const before = await prisma.user.findMany({ orderBy: { id: 'asc' } });

      await expect(repository.changeDisplayName({
        id: user.id, actorUserId: other.id, displayName: 'Cambio de tercero',
        reason: 'Intento ajeno', expectedUpdatedAt: user.updatedAt,
      })).rejects.toBeInstanceOf(UserProfileForbiddenError);

      await expect(prisma.user.findMany({ orderBy: { id: 'asc' } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.count()).resolves.toBe(0);
    });

    it('rechaza User DISABLED conservando sus datos y sin auditoría', async () => {
      const user = await repository.create({ email: 'profile-disabled@example.com', passwordHash: 'hash' });
      const disabled = await repository.update(user.disable());
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      await expect(repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Cambio deshabilitado',
        reason: 'Intento de cambio', expectedUpdatedAt: disabled.updatedAt,
      })).rejects.toBeInstanceOf(UserProfileForbiddenError);

      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.count()).resolves.toBe(0);
    });

    it('revalida ACTIVE después de esperar una deshabilitación concurrente aunque el precheck leyó ACTIVE', async () => {
      const user = await repository.create({ email: 'profile-disabled-concurrent@example.com', passwordHash: 'hash' });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const disabledUpdatedAt = new Date(before.updatedAt.getTime() + 1);
      const disablingClient = new PrismaClient({ datasourceUrl: databaseUrl });
      const writingClient = new PrismaClient({ datasourceUrl: databaseUrl });
      const concurrentRepository = new PrismaUserRepository(writingClient as PrismaIdentityService);
      let precheckStatus: UserStatus | undefined;
      let precheckVersion: Date | undefined;
      const getProfile = new GetUserProfileUseCase({ findById: async (id: string) => {
        const current = await concurrentRepository.findById(id);
        precheckStatus = current?.status;
        precheckVersion = current?.updatedAt;
        return current;
      } });
      const updateProfile = new UpdateUserProfileUseCase(getProfile, concurrentRepository);
      let releaseDisable!: () => void;
      const canCommit = new Promise<void>((resolve) => { releaseDisable = resolve; });
      let signalLocked!: (pid: number) => void;
      let failLock!: (error: unknown) => void;
      const locked = new Promise<number>((resolve, reject) => { signalLocked = resolve; failLock = reject; });
      let disabling: Promise<void> | undefined;
      let pendingChange: Promise<{ error: unknown }> | undefined;

      try {
        await Promise.all([disablingClient.$connect(), writingClient.$connect()]);
        disabling = disablingClient.$transaction(async (transaction) => {
          await transaction.user.update({ where: { id: user.id }, data: { status: UserStatus.DISABLED, updatedAt: disabledUpdatedAt } });
          const [connection] = await transaction.$queryRaw<{ pid: number }[]>(Prisma.sql`SELECT pg_backend_pid() AS pid`);
          signalLocked(connection.pid);
          await canCommit;
        });
        void disabling.catch(failLock);
        const disablingPid = await locked;
        pendingChange = updateProfile.execute({
          id: user.id, actorUserId: user.id, displayName: 'Cambio que no debe persistir',
          reason: 'Formulario abierto antes de deshabilitar', expectedUpdatedAt: before.updatedAt.toISOString(),
        }).then(() => ({ error: null }), (error: unknown) => ({ error }));

        // La condición de PostgreSQL confirma la espera real; no se sincroniza por tiempo transcurrido.
        const deadline = Date.now() + 2_000;
        for (;;) {
          const [waiting] = await prisma.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE ${disablingPid} = ANY(pg_blocking_pids(pid))
            ) AS blocked
          `);
          if (waiting.blocked) break;
          if (Date.now() >= deadline) throw new Error('El cambio de nombre no llegó a esperar el bloqueo de la deshabilitación.');
        }
        expect(precheckStatus).toBe(UserStatus.ACTIVE);
        expect(precheckVersion).toEqual(before.updatedAt);
        releaseDisable();
        await disabling;
        const result = await pendingChange;
        expect(result.error).toBeInstanceOf(UserProfileForbiddenError);

        await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual({
          ...before, status: UserStatus.DISABLED, updatedAt: disabledUpdatedAt,
        });
        await expect(prisma.userDisplayNameAudit.count({ where: { userId: user.id } })).resolves.toBe(0);
      } finally {
        releaseDisable();
        await Promise.allSettled([disabling, pendingChange]);
        await Promise.all([disablingClient.$disconnect(), writingClient.$disconnect()]);
      }
    });

    it('rechaza User inexistente sin crear identidad ni auditoría', async () => {
      const id = '11111111-1111-4111-8111-111111111111';
      await expect(repository.changeDisplayName({
        id, actorUserId: id, displayName: 'Nombre inexistente',
        reason: 'Intento de cambio', expectedUpdatedAt: new Date('2026-01-01'),
      })).rejects.toBeInstanceOf(UserProfileNotFoundError);

      await expect(prisma.user.count()).resolves.toBe(0);
      await expect(prisma.userDisplayNameAudit.count()).resolves.toBe(0);
    });

    it('la FK impide borrar una identidad con historial de nombre', async () => {
      const user = await prisma.user.create({ data: { email: 'profile-history-restrict@example.com' } });
      await repository.changeDisplayName({
        id: user.id, actorUserId: user.id, displayName: 'Nombre conservado',
        reason: 'Completar nombre', expectedUpdatedAt: user.updatedAt,
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const history = await prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } });

      await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });

      await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toEqual(before);
      await expect(prisma.userDisplayNameAudit.findMany({ where: { userId: user.id } })).resolves.toEqual(history);
    });
  });
});
