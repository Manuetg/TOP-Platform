import { Inject, Injectable } from '@nestjs/common';
import { USER_PROFILE_CHANGE_REPOSITORY, type UserProfileChangeRepository } from '../domain/user-profile-change.repository';
import { User } from '../domain/user.entity';
import { GetUserProfileUseCase } from './get-user-profile.use-case';
import { UserProfileInputError } from './user-profile.errors';

@Injectable()
export class UpdateUserProfileUseCase {
  constructor(
    private readonly getProfile: GetUserProfileUseCase,
    @Inject(USER_PROFILE_CHANGE_REPOSITORY) private readonly repository: UserProfileChangeRepository,
  ) {}

  async execute(input: { id: string; actorUserId: string; displayName?: unknown; reason?: unknown; expectedUpdatedAt?: unknown }): Promise<User> {
    await this.getProfile.execute({ id: input.id, actorUserId: input.actorUserId });
    if (typeof input.displayName !== 'string') throw new UserProfileInputError('El nombre es obligatorio.');
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 120) throw new UserProfileInputError('El nombre debe tener entre 1 y 120 caracteres.');
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw new UserProfileInputError('El motivo es obligatorio.');
    const expectedUpdatedAt = this.parseVersion(input.expectedUpdatedAt);
    return this.repository.changeDisplayName({ id: input.id, actorUserId: input.actorUserId, displayName, reason: input.reason.trim(), expectedUpdatedAt });
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
