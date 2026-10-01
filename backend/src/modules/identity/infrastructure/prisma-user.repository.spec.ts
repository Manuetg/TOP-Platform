import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { Prisma } from '@prisma/client';
import { UserEmailConflictError } from '../domain/user.repository';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileNotFoundError } from '../application/user-profile.errors';
import { PrismaIdentityService } from './prisma-identity.service';
import { PrismaUserRepository } from './prisma-user.repository';

describe('PrismaUserRepository', () => {
  it('persiste exclusivamente el nuevo estado al deshabilitar', async () => {
    const updatedAt = new Date('2026-08-04T12:00:00.000Z');
    const prisma = new PrismaIdentityService();
    const update = jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      status: UserStatus.DISABLED,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt,
      displayName: null,
      emailVerifiedAt: null,
    });
    const repository = new PrismaUserRepository(prisma);
    const user = User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', status: UserStatus.DISABLED, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') });

    await expect(repository.update(user)).resolves.toMatchObject({ id: user.id, email: user.email, status: UserStatus.DISABLED, updatedAt });
    expect(update).toHaveBeenCalledWith({ where: { id: user.id }, data: { status: UserStatus.DISABLED } });
  });
  it('persiste exclusivamente el email y mapea el conflicto unique', async () => {
    const prisma = new PrismaIdentityService();
    const update = jest.spyOn(prisma.user, 'update').mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01'), displayName: null, emailVerifiedAt: null });
    const repository = new PrismaUserRepository(prisma);
    const changed = User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01') });
    await expect(repository.updateEmail(changed)).resolves.toMatchObject({ email: 'new@example.com', status: UserStatus.ACTIVE });
    expect(update).toHaveBeenCalledWith({ where: { id: changed.id }, data: { email: changed.email } });
    update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(repository.updateEmail(changed)).rejects.toEqual(new UserEmailConflictError('El email ya está registrado.'));
    const unrelated = new Prisma.PrismaClientKnownRequestError('foreign key', { code: 'P2003', clientVersion: '6.19.3' });
    update.mockRejectedValueOnce(unrelated);
    await expect(repository.updateEmail(changed)).rejects.toBe(unrelated);
  });
});

describe('PrismaUserRepository changeDisplayName', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const actorUserId = '22222222-2222-4222-8222-222222222222';
  const originalVersion = new Date('2026-09-01T12:00:00.000Z');
  const now = new Date('2026-10-01T12:00:00.000Z');
  const reason = 'Corregir el nombre del perfil';
  const transaction = {
    $queryRaw: jest.fn<Promise<{ id: string }[]>, [Prisma.Sql]>(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    userDisplayNameAudit: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const repository = new PrismaUserRepository(prisma as unknown as PrismaIdentityService);
  const row = () => ({
    id,
    email: 'perfil@example.com',
    displayName: 'Nombre anterior' as string | null,
    emailVerifiedAt: new Date('2026-08-02T12:00:00.000Z'),
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: originalVersion,
  });
  const input = () => ({ id, actorUserId: id, displayName: 'Nombre actualizado', reason, expectedUpdatedAt: originalVersion });
  const expectNoWrites = () => {
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(transaction.userDisplayNameAudit.create).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    prisma.$transaction.mockImplementation((callback: (tx: typeof transaction) => Promise<User>) => callback(transaction));
    transaction.$queryRaw.mockResolvedValue([{ id }]);
    transaction.user.findUnique.mockResolvedValue(row());
    transaction.user.update.mockImplementation(({ data }: { data: { displayName: string; updatedAt: Date } }) => Promise.resolve({ ...row(), ...data }));
    transaction.userDisplayNameAudit.create.mockResolvedValue({ id: 'audit-id' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('bloquea con parámetros y guarda nombre, versión y auditoría dentro de la misma transacción', async () => {
    const result = await repository.changeDisplayName(input());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    const lock = transaction.$queryRaw.mock.calls[0][0];
    expect(lock.values).toEqual([id]);
    expect(lock.strings.join(' ')).toContain('"User"');
    expect(lock.strings.join(' ')).toMatch(/FOR\s+UPDATE/i);
    expect(lock.strings.join(' ')).not.toContain(id);
    expect(transaction.user.findUnique).toHaveBeenCalledWith({ where: { id } });
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(transaction.user.update).toHaveBeenCalledWith({ where: { id }, data: { displayName: input().displayName, updatedAt: now } });
    expect(transaction.userDisplayNameAudit.create).toHaveBeenCalledTimes(1);
    expect(transaction.userDisplayNameAudit.create).toHaveBeenCalledWith({ data: {
      userId: id,
      actorUserId: id,
      occurredAt: now,
      beforeName: row().displayName,
      afterName: input().displayName,
      reason,
    } });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(transaction.user.findUnique.mock.invocationCallOrder[0]);
    expect(transaction.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(transaction.user.update.mock.invocationCallOrder[0]);
    expect(transaction.user.update.mock.invocationCallOrder[0]).toBeLessThan(transaction.userDisplayNameAudit.create.mock.invocationCallOrder[0]);
    expect({
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      emailVerifiedAt: result.emailVerifiedAt,
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    }).toEqual({ ...row(), displayName: input().displayName, updatedAt: now });
  });

  it.each([-1000, 0])('avanza al menos un milisegundo cuando el reloj está %s ms respecto a la versión', async (offset) => {
    jest.spyOn(Date, 'now').mockReturnValue(originalVersion.getTime() + offset);
    const updatedAt = new Date(originalVersion.getTime() + 1);

    await expect(repository.changeDisplayName(input())).resolves.toMatchObject({ updatedAt });
    expect(transaction.user.update).toHaveBeenCalledWith({ where: { id }, data: { displayName: input().displayName, updatedAt } });
    expect(transaction.userDisplayNameAudit.create).toHaveBeenCalledWith({ data: {
      userId: id, actorUserId: id, occurredAt: updatedAt,
      beforeName: row().displayName, afterName: input().displayName, reason,
    } });
  });

  it('registra el valor anterior null de un perfil legacy', async () => {
    transaction.user.findUnique.mockResolvedValue({ ...row(), displayName: null });

    await repository.changeDisplayName(input());

    expect(transaction.userDisplayNameAudit.create).toHaveBeenCalledWith({ data: {
      userId: id, actorUserId: id, occurredAt: now,
      beforeName: null, afterName: input().displayName, reason,
    } });
  });

  it('devuelve el perfil vigente sin escribir ni auditar cuando el nombre no cambia', async () => {
    const current = row();
    const result = await repository.changeDisplayName({ ...input(), displayName: current.displayName! });

    expect(result.displayName).toBe(current.displayName);
    expect(result.updatedAt).toEqual(current.updatedAt);
    expect(result.emailVerifiedAt).toEqual(current.emailVerifiedAt);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.user.findUnique).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it.each(['Nombre actualizado', 'Nombre anterior'])('rechaza una versión desactualizada incluso para el nombre %s', async (displayName) => {
    await expect(repository.changeDisplayName({ ...input(), displayName, expectedUpdatedAt: new Date(originalVersion.getTime() - 1) }))
      .rejects.toBeInstanceOf(UserProfileConflictError);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.user.findUnique).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it('rechaza otro actor antes de abrir una transacción o consultar al usuario', async () => {
    await expect(repository.changeDisplayName({ ...input(), actorUserId })).rejects.toBeInstanceOf(UserProfileForbiddenError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('rechaza un usuario inexistente después del bloqueo sin escribir', async () => {
    transaction.$queryRaw.mockResolvedValue([]);
    transaction.user.findUnique.mockResolvedValue(null);

    await expect(repository.changeDisplayName(input())).rejects.toBeInstanceOf(UserProfileNotFoundError);
    expectNoWrites();
  });

  it('rechaza un usuario deshabilitado con una versión vigente sin escribir', async () => {
    transaction.user.findUnique.mockResolvedValue({ ...row(), status: UserStatus.DISABLED });

    await expect(repository.changeDisplayName(input())).rejects.toBeInstanceOf(UserProfileForbiddenError);
    expectNoWrites();
  });

  it('propaga el fallo del bloqueo sin consultar ni escribir', async () => {
    const failure = new Error('Fallo del bloqueo');
    transaction.$queryRaw.mockRejectedValue(failure);

    await expect(repository.changeDisplayName(input())).rejects.toBe(failure);
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('propaga el fallo de lectura sin escribir', async () => {
    const failure = new Error('Fallo de lectura');
    transaction.user.findUnique.mockRejectedValue(failure);

    await expect(repository.changeDisplayName(input())).rejects.toBe(failure);
    expectNoWrites();
  });

  it('propaga el fallo de actualización sin intentar guardar una auditoría', async () => {
    const failure = new Error('Fallo de actualización');
    transaction.user.update.mockRejectedValue(failure);

    await expect(repository.changeDisplayName(input())).rejects.toBe(failure);
    expect(transaction.userDisplayNameAudit.create).not.toHaveBeenCalled();
  });

  it('propaga el fallo de auditoría para que la transacción completa se revierta', async () => {
    const failure = new Error('Fallo de auditoría');
    transaction.userDisplayNameAudit.create.mockRejectedValue(failure);

    await expect(repository.changeDisplayName(input())).rejects.toBe(failure);
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(transaction.userDisplayNameAudit.create).toHaveBeenCalledTimes(1);
  });

  it('propaga el fallo de la transacción sin operaciones parciales', async () => {
    const failure = new Error('Fallo de transacción');
    prisma.$transaction.mockRejectedValue(failure);

    await expect(repository.changeDisplayName(input())).rejects.toBe(failure);
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
