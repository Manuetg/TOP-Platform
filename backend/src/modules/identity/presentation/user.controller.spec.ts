import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserController } from './user.controller';
import { InvalidUserUpdateError, UpdateUserForbiddenError, UpdateUserNotFoundError, UserEmailAlreadyExistsError } from '../application/update-user.use-case';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

const id = '11111111-1111-4111-8111-111111111111';
const updated = User.create({ id, email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01') });

describe('UserController Update User', () => {
  const execute = jest.fn();
  const controller = new UserController({ execute: jest.fn() } as never, { execute: jest.fn() } as never, { execute } as never);
  beforeEach(() => jest.resetAllMocks());

  it('delega únicamente id, actor y email y devuelve DTO público', async () => {
    execute.mockResolvedValueOnce(updated);
    await expect(controller.update(id, { email: ' NEW@EXAMPLE.COM ' }, { userId: id })).resolves.toEqual({ id, email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: updated.createdAt, updatedAt: updated.updatedAt });
    expect(execute).toHaveBeenCalledWith({ id, actorUserId: id, email: ' NEW@EXAMPLE.COM ' });
  });

  it.each([
    [new InvalidUserUpdateError('invalid'), BadRequestException],
    [new UpdateUserForbiddenError('forbidden'), ForbiddenException],
    [new UpdateUserNotFoundError('missing'), NotFoundException],
    [new UserEmailAlreadyExistsError('duplicate'), ConflictException],
  ])('mapea errores esperados', async (error, exception) => {
    execute.mockRejectedValueOnce(error);
    await expect(controller.update(id, { email: 'new@example.com' }, { userId: id })).rejects.toBeInstanceOf(exception);
  });
  it('propaga errores inesperados', async () => { const error = new Error('database'); execute.mockRejectedValueOnce(error); await expect(controller.update(id, { email: 'new@example.com' }, { userId: id })).rejects.toBe(error); });
});
