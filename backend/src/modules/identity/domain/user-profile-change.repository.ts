import { User } from './user.entity';

export const USER_PROFILE_CHANGE_REPOSITORY = Symbol('USER_PROFILE_CHANGE_REPOSITORY');
export const USER_PROFILE_UPDATE_REASON = 'Actualización del perfil por su titular.';

export interface UserProfileChange {
  id: string;
  actorUserId: string;
  displayName: string;
  birthYear?: number | null;
  username?: string | null;
  phone?: string | null;
  avatarId?: string | null;
  reason: string;
  expectedUpdatedAt: Date;
}

export interface UserProfileChangeRepository {
  changeDisplayName(input: UserProfileChange): Promise<User>;
}

export class UserProfileForbiddenError extends Error {}
export class UserProfileNotFoundError extends Error {}
export class UserProfileConflictError extends Error {}
