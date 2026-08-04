import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from '../domain/access-token-issuer';
import { AUTHENTICATION_REPOSITORY, type AuthenticationRepository } from '../domain/authentication.repository';
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from '../domain/membership.repository';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { MembershipRole } from '../domain/membership-role.enum';
import { UserStatus } from '../domain/user-status.enum';
import { REFRESH_SESSION_REPOSITORY, type RefreshSessionRepository } from '../domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER, type RefreshTokenExpiration, type RefreshTokenGenerator, type RefreshTokenHasher } from '../domain/refresh-token';

const invalidCredentialsMessage = 'Las credenciales son inválidas.';
const dummyPasswordHash = '$argon2id$v=19$m=65536,p=4,t=3$I7bOK5B/o9469vUd8ePTyA$oGK/iZ1v+SC5Vqp2/3bMvNM+97idUbFfoZZMy78fw4g';

export class InvalidLoginInputError extends Error {}
export class InvalidCredentialsError extends Error {}
export class UserDisabledError extends Error {}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: { id: string; email: string; status: UserStatus };
  memberships: Array<{ businessId: string; role: MembershipRole }>;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AUTHENTICATION_REPOSITORY) private readonly authenticationRepository: AuthenticationRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly tokenIssuer: AccessTokenIssuer,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    @Inject(REFRESH_TOKEN_GENERATOR) private readonly refreshTokenGenerator: RefreshTokenGenerator,
    @Inject(REFRESH_TOKEN_HASHER) private readonly refreshTokenHasher: RefreshTokenHasher,
    @Inject(REFRESH_TOKEN_EXPIRATION) private readonly refreshTokenExpiration: RefreshTokenExpiration,
  ) {}

  async execute(request: LoginRequest): Promise<LoginResponse> {
    const email = this.validateRequest(request);
    const record = await this.authenticationRepository.findForLoginByEmail(email);

    if (!record) {
      await this.passwordHasher.verify(dummyPasswordHash, request.password);
      throw new InvalidCredentialsError(invalidCredentialsMessage);
    }
    if (record.user.status !== UserStatus.ACTIVE) {
      throw new UserDisabledError('El usuario está deshabilitado.');
    }
    if (!await this.passwordHasher.verify(record.passwordHash, request.password)) {
      throw new InvalidCredentialsError(invalidCredentialsMessage);
    }

    const [memberships, token] = await Promise.all([
      this.membershipRepository.findByUserId(record.user.id),
      this.tokenIssuer.issue({ sub: record.user.id }),
    ]);
    const refreshToken = this.refreshTokenGenerator.generate();
    await this.sessions.create({ userId: record.user.id, tokenHash: this.refreshTokenHasher.hash(refreshToken), expiresAt: this.refreshTokenExpiration.expiresAt(new Date()) });

    return {
      accessToken: token.token,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: token.expiresIn,
      user: { id: record.user.id, email: record.user.email, status: record.user.status },
      memberships: memberships.map((membership) => ({ businessId: membership.businessId, role: membership.role })),
    };
  }

  private validateRequest(request: LoginRequest): string {
    if (typeof request.email !== 'string' || typeof request.password !== 'string' || !request.password) {
      throw new InvalidLoginInputError('El email y la contraseña son obligatorios.');
    }
    const email = request.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new InvalidLoginInputError('El email no es válido.');
    }
    return email;
  }
}
