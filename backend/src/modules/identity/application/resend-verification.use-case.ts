import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import { EMAIL_SENDER, type EmailSender } from '../domain/email-sender';
import { SignupRateLimiter } from './signup-rate-limiter';
import { readAppPublicUrl, readIntegerConfiguration } from '../../../config/environment';
import { EmailFeaturePolicy } from './email-feature-policy';

export const resendVerificationMessage = { status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' as const };

@Injectable()
export class ResendVerificationUseCase {
  private readonly logger = new Logger(ResendVerificationUseCase.name);
  private readonly cooldownMs: number;
  private readonly publicUrl: string;
  constructor(private readonly prisma: PrismaIdentityService, private readonly tokens: CryptoEmailVerificationTokenService, @Inject(EMAIL_SENDER) private readonly email: EmailSender, private readonly limiter: SignupRateLimiter, config: ConfigService = new ConfigService(), private readonly emailFeatures: EmailFeaturePolicy = new EmailFeaturePolicy(config)) {
    const configured = readIntegerConfiguration(config, 'EMAIL_VERIFICATION_RESEND_SECONDS', 60, 0);
    this.cooldownMs = configured * 1000;
    this.publicUrl = readAppPublicUrl(config);
  }
  async execute(input: unknown): Promise<typeof resendVerificationMessage> {
    this.emailFeatures.assertAvailable();
    const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
    if (!email || !this.limiter.allow(email)) return resendVerificationMessage;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!this.isEligible(user)) return resendVerificationMessage;
    const latest = await this.prisma.emailVerificationToken.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    if (this.isCoolingDown(latest, now)) return resendVerificationMessage;
    const rawToken = this.tokens.generate();
    const expiresAt = this.tokens.expiresAt(now);
    await this.persistToken(user.id, rawToken, expiresAt, now);
    await this.deliver(email, rawToken, expiresAt);
    return resendVerificationMessage;
  }
  private isEligible(user: { status: string; emailVerifiedAt: Date | null } | null): user is { id: string; status: string; emailVerifiedAt: Date | null } { return Boolean(user && user.status === 'ACTIVE' && !user.emailVerifiedAt); }
  private isCoolingDown(latest: { createdAt: Date } | null, now: Date): boolean { return Boolean(latest && now.getTime() - latest.createdAt.getTime() < this.cooldownMs); }
  private async persistToken(userId: string, rawToken: string, expiresAt: Date, now: Date): Promise<void> { await this.prisma.$transaction(async (tx) => { await tx.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }); await tx.emailVerificationToken.create({ data: { userId, tokenHash: this.tokens.hash(rawToken), expiresAt } }); }); }
  private async deliver(email: string, rawToken: string, expiresAt: Date): Promise<void> { if (!this.email.sendEmailVerification) return; try { await this.email.sendEmailVerification({ to: email, verificationUrl: `${this.publicUrl}/verify-email?token=${encodeURIComponent(rawToken)}`, expiresAt }); } catch { this.logger.error('No se pudo entregar el correo de verificación.'); } }
}
