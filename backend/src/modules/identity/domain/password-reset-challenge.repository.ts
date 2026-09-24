export const PASSWORD_RESET_CHALLENGE_REPOSITORY = Symbol('PASSWORD_RESET_CHALLENGE_REPOSITORY');
export interface PasswordResetChallengeRepository {
  findLatestPending(userId: string, now: Date): Promise<{ lastSentAt: Date } | null>;
  invalidatePending(userId: string, now: Date): Promise<void>;
  createChallenge(data: { userId: string; codeDigest: string; expiresAt: Date; lastSentAt: Date }): Promise<{ id: string }>;
  verifyAndCreateGrant(data: { challengeId: string; codeDigest: string; now: Date; grantHash: string; grantExpiresAt: Date }): Promise<boolean>;
}
