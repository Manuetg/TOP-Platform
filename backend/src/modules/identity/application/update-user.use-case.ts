import { Inject, Injectable } from '@nestjs/common';
import { USER_BY_ID_LOOKUP, type UserByIdLookup } from '../domain/user-by-id.lookup';
import { USER_REPOSITORY, UserEmailConflictError, type UserRepository } from '../domain/user.repository';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

export class InvalidUserUpdateError extends Error {}
export class UpdateUserNotFoundError extends Error {}
export class UserEmailAlreadyExistsError extends Error {}
export class UpdateUserForbiddenError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

@Injectable()
export class UpdateUserUseCase {
  constructor(@Inject(USER_BY_ID_LOOKUP) private readonly users: UserByIdLookup, @Inject(USER_REPOSITORY) private readonly repository: UserRepository) {}

  async execute(input: { id: string; actorUserId: string; email?: unknown }): Promise<User> {
    this.validateActor(input.id, input.actorUserId);
    const normalizedEmail = this.normalizeEmail(input.email);
    const user = await this.users.findById(input.id);
    if (!user) throw new UpdateUserNotFoundError('El usuario no existe.');
    if (user.status !== UserStatus.ACTIVE) throw new UpdateUserForbiddenError('Un usuario deshabilitado no puede actualizarse.');
    if (user.email === normalizedEmail) return user;
    const existing = await this.repository.findByEmail(normalizedEmail);
    if (existing && existing.id !== user.id) throw new UserEmailAlreadyExistsError('El email ya está registrado.');
    return this.persistEmail(user.updateEmail(normalizedEmail));
  }

  private validateActor(id: string, actorUserId: string): void {
    if (!uuid.test(id)) throw new InvalidUserUpdateError('El identificador del usuario no es válido.');
    if (!uuid.test(actorUserId) || actorUserId !== id) throw new UpdateUserForbiddenError('Solo se permite actualizar el propio usuario.');
  }

  private normalizeEmail(value: unknown): string {
    if (typeof value !== 'string') throw new InvalidUserUpdateError('El email es obligatorio.');
    const normalized = value.trim().toLowerCase();
    if (!normalized) throw new InvalidUserUpdateError('El email es obligatorio.');
    if (!email.test(normalized)) throw new InvalidUserUpdateError('El email no es válido.');
    return normalized;
  }

  private async persistEmail(user: User): Promise<User> {
    try { return await this.repository.updateEmail(user); }
    catch (error: unknown) {
      if (error instanceof UserEmailConflictError) throw new UserEmailAlreadyExistsError('El email ya está registrado.');
      throw error;
    }
  }
}
