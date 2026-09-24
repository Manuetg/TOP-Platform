import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_SENDER, type EmailSender } from '../domain/email-sender';
import { AUTHENTICATION_REPOSITORY, type AuthenticationRepository } from '../domain/authentication.repository';
import { UserStatus } from '../domain/user-status.enum';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY, type PasswordResetChallengeRepository } from '../domain/password-reset-challenge.repository';
import { CryptoPasswordResetOtpService } from '../infrastructure/crypto-password-reset-otp.service';
import { randomUUID } from 'node:crypto';

export const forgotPasswordMessage = 'Si existe una cuenta asociada a ese correo, te enviaremos instrucciones para restablecer tu contraseña.';
export class InvalidForgotPasswordInputError extends Error {}

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(AUTHENTICATION_REPOSITORY) private readonly users: AuthenticationRepository,
    @Inject(PASSWORD_RESET_CHALLENGE_REPOSITORY) private readonly challenges: PasswordResetChallengeRepository,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly crypto: CryptoPasswordResetOtpService,
  ) {}
  async execute(input: { email: string }): Promise<{ message: string; challengeId: string }> {
    if (typeof input?.email !== 'string') throw new InvalidForgotPasswordInputError('El email es obligatorio.');
    const normalized = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new InvalidForgotPasswordInputError('El email no es válido.');
    const user = await this.users.findForLoginByEmail(normalized);
    if (!user || user.user.status !== UserStatus.ACTIVE) return { message: forgotPasswordMessage, challengeId: randomUUID() };
    const now = new Date();
    const latest = await this.challenges.findLatestPending(user.user.id, now);
    if (latest && now.getTime() - latest.lastSentAt.getTime() < this.crypto.resendSeconds * 1000) return { message: forgotPasswordMessage, challengeId: randomUUID() };
    const code = this.crypto.generateCode();
    const expiresAt = this.crypto.expiresAt(now);
    await this.challenges.invalidatePending(user.user.id, now);
    const challenge = await this.challenges.createChallenge({ userId: user.user.id, codeDigest: this.crypto.digest(user.user.id, code), expiresAt, lastSentAt: now });
    await this.email.sendPasswordReset({ to: user.user.email, code, expiresAt });
    return { message: forgotPasswordMessage, challengeId: challenge.id };
  }
}
