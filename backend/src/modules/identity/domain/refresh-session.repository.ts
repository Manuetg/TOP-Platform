import { RefreshSession } from './refresh-session.entity';

export const REFRESH_SESSION_REPOSITORY = Symbol('REFRESH_SESSION_REPOSITORY');

export interface CreateRefreshSessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshSessionRepository {
  create(data: CreateRefreshSessionData): Promise<RefreshSession>;
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<void>;
  rotate(previousSessionId: string, nextSession: CreateRefreshSessionData, revokedAt: Date): Promise<void>;
}
