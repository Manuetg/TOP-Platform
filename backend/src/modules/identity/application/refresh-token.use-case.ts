import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from '../domain/access-token-issuer';
import { REFRESH_SESSION_REPOSITORY, type RefreshSessionRepository } from '../domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER, type RefreshTokenExpiration, type RefreshTokenGenerator, type RefreshTokenHasher } from '../domain/refresh-token';
import { USER_BY_ID_LOOKUP, type UserByIdLookup } from '../domain/user-by-id.lookup';
import { UserStatus } from '../domain/user-status.enum';

const invalidRefreshTokenMessage = 'La sesión no es válida.';

export class InvalidRefreshTokenInputError extends Error {}
export class InvalidRefreshTokenError extends Error {}
export class RefreshUserDisabledError extends Error {}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(REFRESH_TOKEN_GENERATOR) private readonly generator: RefreshTokenGenerator,
    @Inject(REFRESH_TOKEN_HASHER) private readonly hasher: RefreshTokenHasher,
    @Inject(REFRESH_TOKEN_EXPIRATION) private readonly expiration: RefreshTokenExpiration,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuer,
    @Inject(USER_BY_ID_LOOKUP) private readonly users: UserByIdLookup,
  ) {}

  async execute(refreshToken: string): Promise<RefreshTokenResponse> {
    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      throw new InvalidRefreshTokenInputError('El refresh token es obligatorio.');
    }
    const session = await this.sessions.findByTokenHash(this.hasher.hash(refreshToken));
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new InvalidRefreshTokenError(invalidRefreshTokenMessage);
    }
    const user = await this.users.findById(session.userId);
    if (!user) throw new InvalidRefreshTokenError(invalidRefreshTokenMessage);
    if (user.status !== UserStatus.ACTIVE) throw new RefreshUserDisabledError('El usuario está deshabilitado.');

    const nextToken = this.generator.generate();
    const nextSession = { userId: user.id, tokenHash: this.hasher.hash(nextToken), expiresAt: this.expiration.expiresAt(new Date()) };
    const accessToken = await this.accessTokens.issue({ sub: user.id });
    await this.sessions.rotate(session.id, nextSession, new Date());
    return { accessToken: accessToken.token, refreshToken: nextToken, tokenType: 'Bearer', expiresIn: accessToken.expiresIn };
  }
}
