import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from '../application/user-profile.errors';
import { UserController } from './user.controller';

const id = '11111111-1111-4111-8111-111111111111';
const user = (displayName?: string | null): User => User.create({
  id, email: 'ana@example.test', displayName, emailVerifiedAt: new Date('2026-09-01'),
  status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01'),
});

describe('UserController perfil personal', () => {
  const get = jest.fn();
  const update = jest.fn();
  const controller = new UserController(
    { execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute: jest.fn() } as never,
    { execute: get } as never, { execute: update } as never,
  );
  beforeEach(() => jest.resetAllMocks());

  it.each([undefined, null, 'Ana Pérez'])('consulta solo los datos públicos e incluye nombre nullable', async (displayName) => {
    get.mockResolvedValueOnce(user(displayName));
    await expect(controller.getProfile(id, { userId: id })).resolves.toEqual({
      id, email: 'ana@example.test', displayName: displayName ?? null, status: UserStatus.ACTIVE,
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(get).toHaveBeenCalledWith({ id, actorUserId: id });
  });

  it('delega solo nombre, motivo, versión e identidad del principal sin campos protegidos', async () => {
    update.mockResolvedValueOnce(user('Nombre actualizado'));
    const request = { displayName: ' Nombre actualizado ', reason: ' Corregí el nombre ', expectedUpdatedAt: '2026-09-01T00:00:00.000Z', email: 'ajeno@example.test', status: 'DISABLED', actorUserId: 'ajeno', updatedAt: '2027-01-01T00:00:00.000Z' };
    await expect(controller.updateProfile(id, request, { userId: id })).resolves.toEqual({
      id, email: 'ana@example.test', displayName: 'Nombre actualizado', status: UserStatus.ACTIVE, updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(update).toHaveBeenCalledWith({ id, actorUserId: id, displayName: request.displayName, reason: request.reason, expectedUpdatedAt: request.expectedUpdatedAt });
  });

  it.each([
    [new UserProfileInputError('invalid'), BadRequestException],
    [new UserProfileForbiddenError('forbidden'), ForbiddenException],
    [new UserProfileNotFoundError('missing'), NotFoundException],
    [new UserProfileConflictError('stale'), ConflictException],
  ])('traduce errores de escritura incluidos los conflictos de versión', async (error, exception) => {
    update.mockRejectedValueOnce(error);
    await expect(controller.updateProfile(id, { displayName: 'Ana', reason: 'Corrección', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }, { userId: id })).rejects.toBeInstanceOf(exception);
  });

  it.each([
    [new UserProfileInputError('invalid'), BadRequestException],
    [new UserProfileForbiddenError('forbidden'), ForbiddenException],
    [new UserProfileNotFoundError('missing'), NotFoundException],
  ])('traduce los errores contractuales de lectura', async (error, exception) => {
    get.mockRejectedValueOnce(error);
    await expect(controller.getProfile(id, { userId: id })).rejects.toBeInstanceOf(exception);
  });

  it('deja propagarse errores inesperados sin devolver datos', async () => {
    const error = new Error('database unavailable');
    get.mockRejectedValueOnce(error);
    update.mockRejectedValueOnce(error);
    await expect(controller.getProfile(id, { userId: id })).rejects.toBe(error);
    await expect(controller.updateProfile(id, { displayName: 'Ana', reason: 'Corrección', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }, { userId: id })).rejects.toBe(error);
  });
});
