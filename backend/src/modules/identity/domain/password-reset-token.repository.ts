export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('PASSWORD_RESET_TOKEN_REPOSITORY');

export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  invalidatePending(userId: string, now: Date): Promise<void>;
  create(data: CreatePasswordResetTokenData): Promise<void>;
  consumeAndResetPassword(data: { tokenHash: string; passwordHash: string; now: Date }): Promise<boolean>;
}
