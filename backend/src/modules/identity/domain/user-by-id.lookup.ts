import { User } from './user.entity';

export const USER_BY_ID_LOOKUP = Symbol('USER_BY_ID_LOOKUP');
export interface UserByIdLookup { findById(id: string): Promise<User | null>; }
