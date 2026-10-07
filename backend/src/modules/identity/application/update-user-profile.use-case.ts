import { Inject, Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { USER_PROFILE_CHANGE_REPOSITORY, USER_PROFILE_UPDATE_REASON, type UserProfileChange, type UserProfileChangeRepository } from '../domain/user-profile-change.repository';
import { User } from '../domain/user.entity';
import { PROFILE_AVATAR_IDS } from '../domain/profile-avatar';
import { GetUserProfileUseCase } from './get-user-profile.use-case';
import { UserProfileInputError } from './user-profile.errors';

@Injectable()
export class UpdateUserProfileUseCase {
  constructor(
    private readonly getProfile: GetUserProfileUseCase,
    @Inject(USER_PROFILE_CHANGE_REPOSITORY) private readonly repository: UserProfileChangeRepository,
  ) {}

  async execute(input: { id: string; actorUserId: string; displayName?: unknown; birthYear?: unknown; username?: unknown; phone?: unknown; avatarId?: unknown; expectedUpdatedAt?: unknown }): Promise<User> {
    await this.getProfile.execute({ id: input.id, actorUserId: input.actorUserId });
    if (typeof input.displayName !== 'string') throw new UserProfileInputError('El nombre es obligatorio.');
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 120) throw new UserProfileInputError('El nombre debe tener entre 1 y 120 caracteres.');
    const expectedUpdatedAt = this.parseVersion(input.expectedUpdatedAt);
    const change: UserProfileChange = { id: input.id, actorUserId: input.actorUserId, displayName, reason: USER_PROFILE_UPDATE_REASON, expectedUpdatedAt };
    if (input.birthYear !== undefined) change.birthYear = this.parseBirthYear(input.birthYear);
    if (input.username !== undefined) change.username = this.parseUsername(input.username);
    if (input.phone !== undefined) change.phone = this.parsePhone(input.phone);
    if (input.avatarId !== undefined) change.avatarId = this.parseAvatar(input.avatarId);
    return this.repository.changeDisplayName(change);
  }

  private parseBirthYear(value: unknown): number | null {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > new Date().getUTCFullYear()) {
      throw new UserProfileInputError('El año de nacimiento debe ser un año entero válido y no puede estar en el futuro.');
    }
    return value;
  }

  private parseUsername(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new UserProfileInputError('El nombre de usuario debe ser un texto.');
    const username = value.trim();
    if (!username) return null;
    if (username.length > 50) throw new UserProfileInputError('El nombre de usuario no puede superar 50 caracteres.');
    return username;
  }

  private parsePhone(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new UserProfileInputError('El teléfono debe ser un número internacional.');
    const phone = value.trim();
    if (!phone) return null;
    const parsed = phone.startsWith('+') ? parsePhoneNumberFromString(phone, { extract: false }) : undefined;
    if (!parsed || parsed.ext || !parsed.isPossible()) throw new UserProfileInputError('Ingresa un teléfono internacional válido con el prefijo +.');
    return parsed.number;
  }

  private parseAvatar(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || !PROFILE_AVATAR_IDS.some((avatar) => avatar === value)) {
      throw new UserProfileInputError('Elige un avatar del catálogo de TOP.');
    }
    return value;
  }

  private parseVersion(value: unknown): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      throw new UserProfileInputError('La versión del perfil debe ser el updatedAt vigente en formato ISO UTC.');
    }
    const version = new Date(value);
    if (!Number.isFinite(version.getTime()) || version.toISOString() !== value) throw new UserProfileInputError('La versión del perfil no es válida.');
    return version;
  }
}
