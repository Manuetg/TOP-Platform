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

export const passwordHasherFake = { hash: (password: string): Promise<string> => Promise.resolve(`hash:${password.length}`), verify: (): Promise<boolean> => Promise.resolve(false) };
export const resetUserRepositoryFake = (): void => { users.clear(); credentials.clear(); };
export const userCount = (): number => users.size;
export const credentialCount = (): number => credentials.size;
