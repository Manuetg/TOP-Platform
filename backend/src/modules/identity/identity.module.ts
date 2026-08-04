import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CreateUserUseCase } from './application/create-user.use-case';
import { CreateMembershipUseCase } from './application/create-membership.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { DisableUserUseCase } from './application/disable-user.use-case';
import { ACCESS_TOKEN_ISSUER } from './domain/access-token-issuer';
import { AUTHENTICATION_REPOSITORY } from './domain/authentication.repository';
import { BUSINESS_LOOKUP, MEMBERSHIP_REPOSITORY, USER_LOOKUP } from './domain/membership.repository';
import { PASSWORD_HASHER } from './domain/password-hasher';
import { USER_REPOSITORY } from './domain/user.repository';
import { REFRESH_SESSION_REPOSITORY } from './domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER } from './domain/refresh-token';
import { USER_BY_ID_LOOKUP } from './domain/user-by-id.lookup';
import { USER_STATUS_REPOSITORY } from './domain/user-status.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaIdentityService } from './infrastructure/prisma-identity.service';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { PrismaMembershipRepository } from './infrastructure/prisma-membership.repository';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token-issuer';
import { CryptoRefreshTokenService } from './infrastructure/crypto-refresh-token.service';
import { PrismaRefreshSessionRepository } from './infrastructure/prisma-refresh-session.repository';
import { AuthController } from './presentation/auth.controller';
import { MembershipController } from './presentation/membership.controller';
import { UserController } from './presentation/user.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [UserController, MembershipController, AuthController],
  providers: [
    PrismaIdentityService,
    PrismaMembershipRepository,
    PrismaUserRepository,
    PrismaRefreshSessionRepository,
    JwtAccessTokenIssuer,
    CryptoRefreshTokenService,
    { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: AUTHENTICATION_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: USER_BY_ID_LOOKUP, useExisting: PrismaUserRepository },
    { provide: USER_STATUS_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_ISSUER, useExisting: JwtAccessTokenIssuer },
    { provide: REFRESH_SESSION_REPOSITORY, useExisting: PrismaRefreshSessionRepository },
    { provide: REFRESH_TOKEN_GENERATOR, useExisting: CryptoRefreshTokenService },
    { provide: REFRESH_TOKEN_HASHER, useExisting: CryptoRefreshTokenService },
    { provide: REFRESH_TOKEN_EXPIRATION, useExisting: CryptoRefreshTokenService },
    { provide: MEMBERSHIP_REPOSITORY, useExisting: PrismaMembershipRepository },
    { provide: USER_LOOKUP, useExisting: PrismaMembershipRepository },
    { provide: BUSINESS_LOOKUP, useFactory: (repository: PrismaMembershipRepository) => ({ exists: (id: string) => repository.businessExists(id) }), inject: [PrismaMembershipRepository] },
    CreateUserUseCase,
    CreateMembershipUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    DisableUserUseCase,
  ],
})
export class IdentityModule {}
