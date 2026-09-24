import { GetBusinessCapabilitiesUseCase } from './application/get-business-capabilities.use-case';
import { AuthorizationPolicy } from '../../shared/application/authorization-policy';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CreateUserUseCase } from './application/create-user.use-case';
import { CreateMembershipUseCase } from './application/create-membership.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { DisableUserUseCase } from './application/disable-user.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { ACCESS_TOKEN_ISSUER, ACCESS_TOKEN_VERIFIER } from './domain/access-token-issuer';
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
import { ForgotPasswordUseCase } from './application/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/password-reset-token.repository';
import { PrismaPasswordResetTokenRepository } from './infrastructure/prisma-password-reset-token.repository';
import { CryptoPasswordResetTokenService } from './infrastructure/crypto-password-reset-token.service';
import { EMAIL_SENDER } from './domain/email-sender';
import { ConsoleEmailSender } from './infrastructure/console-email-sender';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from './domain/password-reset-challenge.repository';
import { CryptoPasswordResetOtpService } from './infrastructure/crypto-password-reset-otp.service';
import { VerifyResetCodeUseCase } from './application/verify-reset-code.use-case';
import { SignupUseCase } from './application/signup.use-case';
import { VerifyEmailUseCase } from './application/verify-email.use-case';
import { SignupRateLimiter } from './application/signup-rate-limiter';
import { CryptoEmailVerificationTokenService } from './infrastructure/crypto-email-verification-token.service';
import { ResendVerificationUseCase } from './application/resend-verification.use-case';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [UserController, MembershipController, AuthController],
  providers: [GetBusinessCapabilitiesUseCase, AuthorizationPolicy,
    PrismaIdentityService,
    PrismaMembershipRepository,
    PrismaUserRepository,
    PrismaRefreshSessionRepository,
    PrismaPasswordResetTokenRepository,
    CryptoPasswordResetTokenService,
    CryptoPasswordResetOtpService,
    CryptoEmailVerificationTokenService,
    ConsoleEmailSender,
    SmtpEmailSender,
    { provide: EMAIL_SENDER, inject: [ConfigService, ConsoleEmailSender, SmtpEmailSender], useFactory: (config: ConfigService, consoleSender: ConsoleEmailSender, smtpSender: SmtpEmailSender) => { const mode = config.get<string>('EMAIL_DELIVERY_MODE', 'console'); if (config.get<string>('NODE_ENV') === 'production' && mode !== 'smtp') throw new Error('EMAIL_DELIVERY_MODE=smtp es obligatorio en producción.'); return mode === 'smtp' ? smtpSender : consoleSender; } },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useExisting: PrismaPasswordResetTokenRepository },
    { provide: PASSWORD_RESET_CHALLENGE_REPOSITORY, useExisting: PrismaPasswordResetTokenRepository },
    JwtAccessTokenIssuer,
    CryptoRefreshTokenService,
    { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: AUTHENTICATION_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: USER_BY_ID_LOOKUP, useExisting: PrismaUserRepository },
    { provide: USER_STATUS_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_ISSUER, useExisting: JwtAccessTokenIssuer },
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: JwtAccessTokenIssuer },
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
    UpdateUserUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    VerifyResetCodeUseCase,
    SignupUseCase,
    ResendVerificationUseCase,
    VerifyEmailUseCase,
    SignupRateLimiter,
  ],
  exports: [GetBusinessCapabilitiesUseCase,ACCESS_TOKEN_VERIFIER, MEMBERSHIP_REPOSITORY, USER_BY_ID_LOOKUP],
})
export class IdentityModule {}
