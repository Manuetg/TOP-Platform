import { User } from './user.entity';

export const AUTHENTICATION_REPOSITORY = Symbol('AUTHENTICATION_REPOSITORY');

export interface AuthenticationRecord {
  user: User;
  passwordHash: string;
}

export interface AuthenticationRepository {
  findForLoginByEmail(email: string): Promise<AuthenticationRecord | null>;
}
