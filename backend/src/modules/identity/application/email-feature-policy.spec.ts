import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import type { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import type { CryptoPasswordResetOtpService } from '../infrastructure/crypto-password-reset-otp.service';
import type { CryptoPasswordResetTokenService } from '../infrastructure/crypto-password-reset-token.service';
import { EmailFeatureDisabledError } from '../domain/email-feature-disabled.error';
import { EmailFeaturePolicy } from './email-feature-policy';
import { ForgotPasswordUseCase } from './forgot-password.use-case';
import { ResendVerificationUseCase } from './resend-verification.use-case';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { SignupUseCase } from './signup.use-case';
import { SignupRateLimiter } from './signup-rate-limiter';
import { VerifyEmailUseCase } from './verify-email.use-case';
import { VerifyResetCodeUseCase } from './verify-reset-code.use-case';

describe('Funciones de correo deshabilitadas en aplicación', () => {
  const values: Record<string, unknown> = { NODE_ENV: 'production', TOP_DEPLOYMENT_PROFILE: 'lan-pilot', EMAIL_DELIVERY_MODE: 'disabled', APP_PUBLIC_URL: 'http://192.168.1.20:3001' };
  const config = new ConfigService(values);
  jest.spyOn(config, 'get').mockImplementation((key: string) => values[key]);
  const policy = new EmailFeaturePolicy(config);
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const transaction = jest.fn();
  const generate = jest.fn();
  const hash = jest.fn();
  const expiresAt = jest.fn();
  const digest = jest.fn();
  const generateCode = jest.fn();
  const findForLoginByEmail = jest.fn();
  const sendPasswordReset = jest.fn();
  const sendEmailVerification = jest.fn();
  const findLatestPending = jest.fn();
  const invalidatePending = jest.fn();
  const createChallenge = jest.fn();
  const verifyAndCreateGrant = jest.fn();
  const consumeAndResetPassword = jest.fn();
  const allow = jest.fn();
  const prisma = { $transaction: transaction, user: { findUnique }, emailVerificationToken: { findUnique, findFirst } } as unknown as PrismaIdentityService;
  const tokens = { generate, hash, expiresAt } as unknown as CryptoEmailVerificationTokenService;
  const otp = { generateCode, digest, expiresAt, resendSeconds: 60 } as unknown as CryptoPasswordResetOtpService;
  const grants = { generate, hash } as unknown as CryptoPasswordResetTokenService;
  const hasher = { hash, verify: jest.fn() };
  const email = { sendPasswordReset, sendEmailVerification };
  const challenges = { findLatestPending, invalidatePending, createChallenge, verifyAndCreateGrant };
  const limiter = { allow } as unknown as SignupRateLimiter;
  const effects = [findUnique, findFirst, transaction, generate, hash, expiresAt, digest, generateCode, findForLoginByEmail, sendPasswordReset, sendEmailVerification, findLatestPending, invalidatePending, createChallenge, verifyAndCreateGrant, consumeAndResetPassword, allow];
  const marker = 'synthetic-sensitive-token-marker';
  const signup = new SignupUseCase(prisma, hasher, email, tokens, limiter, config, policy);
  const resend = new ResendVerificationUseCase(prisma, tokens, email, limiter, config, policy);
  const forgot = new ForgotPasswordUseCase({ findForLoginByEmail }, challenges, email, otp, policy);
  const verify = new VerifyEmailUseCase(prisma, tokens, policy);
  const verifyReset = new VerifyResetCodeUseCase(challenges, otp, grants, policy);
  const reset = new ResetPasswordUseCase({ consumeAndResetPassword, invalidatePending, create: jest.fn() }, hasher, grants, policy);
  const requests: Array<[string, () => Promise<unknown>]> = [
    ['signup', () => signup.execute({ displayName: 'Familia sintética', email: 'known@top.test', password: marker, businessName: 'Alojamiento sintético', timezone: 'America/Asuncion' })],
    ['signup inválido', () => signup.execute({ displayName: null, email: null, password: null, businessName: null, timezone: null })],
    ['resend conocido', () => resend.execute('known@top.test')],
    ['resend desconocido', () => resend.execute('unknown@top.test')],
    ['forgot conocido', () => forgot.execute({ email: 'known@top.test' })],
    ['forgot desconocido', () => forgot.execute({ email: 'unknown@top.test' })],
    ['verify-email', () => verify.execute(marker)],
    ['verify-email vacío', () => verify.execute('')],
    ['verify-reset-code', () => verifyReset.execute({ challengeId: marker, code: '123456' })],
    ['reset-password', () => reset.execute({ resetGrant: marker, password: marker })],
  ];

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it.each(requests)('%s falla antes de consultas, tokens, hashes, cooldown, escrituras o envío', async (_name, execute) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try { await execute(); throw new Error('Solicitud deshabilitada aceptada.'); }
    catch (error: unknown) {
      expect(error).toBeInstanceOf(EmailFeatureDisabledError);
      expect((error as EmailFeatureDisabledError).code).toBe('EMAIL_FEATURE_DISABLED');
      expect(String(error)).not.toContain(marker);
      expect((error as Error).stack).not.toContain(marker);
    }
    for (const effect of effects) expect(effect).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('mantiene habilitado el flujo standard y rechaza piloto con transporte diferente', () => {
    expect(() => new EmailFeaturePolicy(new ConfigService({ NODE_ENV: 'test' })).assertAvailable()).not.toThrow();
    for (const mode of ['console', 'smtp', undefined]) {
      const input: Record<string, unknown> = { ...values, EMAIL_DELIVERY_MODE: mode };
      const invalid = new ConfigService(input);
      jest.spyOn(invalid, 'get').mockImplementation((key: string) => input[key]);
      expect(() => new EmailFeaturePolicy(invalid)).toThrow('EMAIL_DELIVERY_MODE');
    }
  });
});
