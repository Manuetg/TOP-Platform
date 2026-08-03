import { User } from '../../../src/modules/identity/domain/user.entity';
import { UserStatus } from '../../../src/modules/identity/domain/user-status.enum';

const users = new Map<string, User>();
const credentials = new Map<string, string>();

export const userRepositoryFake = {
  findByEmail: (email: string): Promise<User | null> => Promise.resolve(users.get(email) ?? null),
  create: ({ email, passwordHash }: { email: string; passwordHash: string }): Promise<User> => {
    const now = new Date();
    const user = User.create({ id: `user-${users.size + 1}`, email, status: UserStatus.ACTIVE, createdAt: now, updatedAt: now });
    users.set(email, user);
    credentials.set(user.id, passwordHash);
    return Promise.resolve(user);
  },
};

export const authenticationRepositoryFake = {
  findForLoginByEmail: (email: string): Promise<{ user: User; passwordHash: string } | null> => {
    const user = users.get(email);
    const passwordHash = user ? credentials.get(user.id) : undefined;
    return Promise.resolve(user && passwordHash ? { user, passwordHash } : null);
  },
};

export const addUserForLoginFake = (email: string, password: string, status = UserStatus.ACTIVE): User => {
  const now = new Date();
  const user = User.create({ id: `login-user-${users.size + 1}`, email, status, createdAt: now, updatedAt: now });
  users.set(email, user);
  credentials.set(user.id, `hash:${password.length}`);
  return user;
};

export const passwordHasherFake = {
  hash: (password: string): Promise<string> => Promise.resolve(`hash:${password.length}`),
  verify: (hash: string, password: string): Promise<boolean> => Promise.resolve(hash === `hash:${password.length}`),
};
export const resetUserRepositoryFake = (): void => { users.clear(); credentials.clear(); };
export const userCount = (): number => users.size;
export const credentialCount = (): number => credentials.size;
