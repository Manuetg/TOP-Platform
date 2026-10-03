import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { User, type UserProps } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from '../application/user-profile.errors';
import { UserController } from './user.controller';

const id = '11111111-1111-4111-8111-111111111111';
const user = (overrides: Partial<UserProps> = {}): User => User.create({
  id, email: 'ana@example.test', emailVerifiedAt: new Date('2026-09-01'),
  status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01'), ...overrides,
});
const expectedProfile = (overrides: Record<string, unknown> = {}): object => ({
  id, email: 'ana@example.test', displayName: null, birthYear: null, username: null, phone: null, avatarId: null,
  status: UserStatus.ACTIVE, updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});

describe('UserController perfil personal', () => {
  const get = jest.fn();
  const update = jest.fn();
  const controller = new UserController(
    { execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute: jest.fn() } as never,
    { execute: get } as never, { execute: update } as never,
  );
  beforeEach(() => jest.resetAllMocks());

  it.each([undefined, null, 'Ana Pérez'])('consulta solo los datos públicos e incluye nombre y nuevos campos nullable', async (displayName) => {
    get.mockResolvedValueOnce(user({ displayName }));
    await expect(controller.getProfile(id, { userId: id })).resolves.toEqual(expectedProfile({ displayName: displayName ?? null }));
    expect(get).toHaveBeenCalledWith({ id, actorUserId: id });
  });

  it('serializa los campos nuevos vigentes sin filtrar datos internos', async () => {
    get.mockResolvedValueOnce(user({ displayName: 'Ana Pérez', birthYear: 1990, username: 'ana', phone: '+595981123456', avatarId: 'sun' }));
    await expect(controller.getProfile(id, { userId: id })).resolves.toEqual(expectedProfile({
      displayName: 'Ana Pérez', birthYear: 1990, username: 'ana', phone: '+595981123456', avatarId: 'sun',
    }));
  });

  it('delega los datos de perfil y toma la identidad del principal sin motivo cliente ni campos protegidos', async () => {
    update.mockResolvedValueOnce(user({ displayName: 'Nombre actualizado', birthYear: 1990, username: 'ana', phone: '+595981123456', avatarId: 'leaf' }));
    const body = {
      displayName: ' Nombre actualizado ', birthYear: 1990, username: ' ana ', phone: '+595981123456', avatarId: 'leaf',
      reason: 'Motivo inyectado', expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      email: 'ajeno@example.test', status: 'DISABLED', actorUserId: 'ajeno', updatedAt: '2027-01-01T00:00:00.000Z',
      password: 'contraseña sintética', unknownField: 'dato desconocido',
    };
    await expect(controller.updateProfile(id, body, { userId: id })).resolves.toEqual(expectedProfile({
      displayName: 'Nombre actualizado', birthYear: 1990, username: 'ana', phone: '+595981123456', avatarId: 'leaf',
    }));
    expect(update).toHaveBeenCalledWith({
      id, actorUserId: id, displayName: body.displayName, expectedUpdatedAt: body.expectedUpdatedAt,
      birthYear: body.birthYear, username: body.username, phone: body.phone, avatarId: body.avatarId,
    });
  });

  it('conserva la diferencia entre opcionales omitidos y null explícito al delegar', async () => {
    update.mockResolvedValue(user({ displayName: 'Ana' }));
    await controller.updateProfile(id, { displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }, { userId: id });
    expect(update).toHaveBeenLastCalledWith({
      id, actorUserId: id, displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      birthYear: undefined, username: undefined, phone: undefined, avatarId: undefined,
    });
    await controller.updateProfile(id, {
      displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z', birthYear: null, username: null, phone: null, avatarId: null,
    }, { userId: id });
    expect(update).toHaveBeenLastCalledWith({
      id, actorUserId: id, displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      birthYear: null, username: null, phone: null, avatarId: null,
    });
  });

  it.each([
    [new UserProfileInputError('invalid'), BadRequestException],
    [new UserProfileForbiddenError('forbidden'), ForbiddenException],
    [new UserProfileNotFoundError('missing'), NotFoundException],
    [new UserProfileConflictError('stale'), ConflictException],
  ])('traduce errores de escritura incluidos los conflictos de versión', async (error, exception) => {
    update.mockRejectedValueOnce(error);
    await expect(controller.updateProfile(id, { displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }, { userId: id })).rejects.toBeInstanceOf(exception);
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
    await expect(controller.updateProfile(id, { displayName: 'Ana', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' }, { userId: id })).rejects.toBe(error);
  });
});
