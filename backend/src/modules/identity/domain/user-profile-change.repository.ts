import { User } from './user.entity';

export const USER_PROFILE_CHANGE_REPOSITORY = Symbol('USER_PROFILE_CHANGE_REPOSITORY');

export interface UserProfileChange {
  id: string;
  actorUserId: string;
  displayName: string;
  reason: string;
  expectedUpdatedAt: Date;
}

export interface UserProfileChangeRepository {
  changeDisplayName(input: UserProfileChange): Promise<User>;
}

export class UserProfileForbiddenError extends Error {}
export class UserProfileNotFoundError extends Error {}
export class UserProfileConflictError extends Error {}
