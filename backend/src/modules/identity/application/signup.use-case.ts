import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { EMAIL_SENDER, type EmailSender } from '../domain/email-sender';
import { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import { SignupRateLimiter } from './signup-rate-limiter';

export interface SignupRequest { displayName: unknown; email: unknown; password: unknown; businessName: unknown; timezone: unknown; }
export interface SignupResponse { status: 'EMAIL_VERIFICATION_REQUIRED'; email: string; }
export class InvalidSignupInputError extends Error {}
export class SignupEmailConflictError extends Error {}

@Injectable()
export class SignupUseCase {
  private readonly logger = new Logger(SignupUseCase.name);
  constructor(private readonly prisma: PrismaIdentityService, @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher, @Inject(EMAIL_SENDER) private readonly email: EmailSender, private readonly tokenService: CryptoEmailVerificationTokenService, private readonly limiter: SignupRateLimiter) {}
  async execute(input: SignupRequest): Promise<SignupResponse> {
    const data = this.validate(input);
    if (!this.limiter.allow(data.email)) throw new InvalidSignupInputError('Demasiados intentos. Esperá unos minutos e intentá nuevamente.');
    const passwordHash = await this.passwordHasher.hash(data.password);
    const token = this.tokenService.generate();
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email: data.email, displayName: data.displayName, status: 'ACTIVE', emailVerifiedAt: null } });
        await tx.localCredential.create({ data: { userId: user.id, passwordHash } });
        const business = await tx.business.create({ data: { name: data.businessName, timezone: data.timezone, currency: 'PYG', status: 'ACTIVE' } });
        await tx.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role: 'OWNER' } });
        await tx.businessSubscription.create({ data: { businessId: business.id, planCode: 'TOP_INITIAL' } });
        await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: this.tokenService.hash(token), expiresAt: this.tokenService.expiresAt(now) } });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SignupEmailConflictError('Ya existe una cuenta con este correo. Iniciá sesión o recuperá tu contraseña.');
      throw error;
    }
    const publicUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:3001';
    if (this.email.sendEmailVerification) {
      try { await this.email.sendEmailVerification({ to: data.email, verificationUrl: `${publicUrl}/verify-email?token=${encodeURIComponent(token)}`, expiresAt: this.tokenService.expiresAt(now) }); }
      catch (error: unknown) { this.logger.error('No se pudo entregar el correo de verificación.', error instanceof Error ? error.stack : undefined); }
    }
    return { status: 'EMAIL_VERIFICATION_REQUIRED', email: data.email };
  }
  private validate(input: SignupRequest): { displayName: string; email: string; password: string; businessName: string; timezone: string } {
    const displayName = this.text(input.displayName, 'El nombre es obligatorio.', 120);
    const businessName = this.text(input.businessName, 'El nombre del alojamiento es obligatorio.', 160);
    if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new InvalidSignupInputError('La contraseña debe tener entre 12 y 128 caracteres.');
    if (typeof input.email !== 'string') throw new InvalidSignupInputError('El email no es válido.');
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidSignupInputError('El email no es válido.');
    if (typeof input.timezone !== 'string' || !input.timezone.trim()) throw new InvalidSignupInputError('La zona horaria es obligatoria.');
    const timezone = input.timezone.trim();
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { throw new InvalidSignupInputError('La zona horaria no es válida.'); }
    return { displayName, email, password: input.password, businessName, timezone };
  }
  private text(value: unknown, required: string, max: number): string { if (typeof value !== 'string') throw new InvalidSignupInputError(required); const result = value.trim(); if (!result || result.length > max) throw new InvalidSignupInputError(required); return result; }
}
