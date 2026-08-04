import { User } from './user.entity';
export const USER_STATUS_REPOSITORY = Symbol('USER_STATUS_REPOSITORY');
export interface UserStatusRepository { update(user: User): Promise<User>; }
