import { Inject, Injectable } from '@nestjs/common';
import { REFRESH_SESSION_REPOSITORY, type RefreshSessionRepository } from '../domain/refresh-session.repository';
import { REFRESH_TOKEN_HASHER, type RefreshTokenHasher } from '../domain/refresh-token';

export class InvalidLogoutInputError extends Error {}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_HASHER) private readonly hasher: RefreshTokenHasher,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      throw new InvalidLogoutInputError('El refresh token es obligatorio.');
    }
    await this.sessions.revokeByTokenHash(this.hasher.hash(refreshToken), new Date());
  }
}
