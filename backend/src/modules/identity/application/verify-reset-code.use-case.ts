import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY, type PasswordResetChallengeRepository } from '../domain/password-reset-challenge.repository';
import { CryptoPasswordResetOtpService } from '../infrastructure/crypto-password-reset-otp.service';
import { CryptoPasswordResetTokenService } from '../infrastructure/crypto-password-reset-token.service';
export class InvalidResetCodeError extends Error {}
@Injectable()
export class VerifyResetCodeUseCase {
  constructor(@Inject(PASSWORD_RESET_CHALLENGE_REPOSITORY) private readonly challenges: PasswordResetChallengeRepository, private readonly otp: CryptoPasswordResetOtpService, private readonly grants: CryptoPasswordResetTokenService) {}
  async execute(input: { challengeId: string; code: string }): Promise<{ resetGrant: string }> {
    if (typeof input?.challengeId !== 'string' || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new InvalidResetCodeError('Código inválido o vencido.');
    const resetGrant = this.grants.generate(); const now = new Date();
    const valid = await this.challenges.verifyAndCreateGrant({ challengeId: input.challengeId, codeDigest: this.otp.digest(input.challengeId, input.code), now, grantHash: this.grants.hash(resetGrant), grantExpiresAt: new Date(now.getTime() + 900000) });
    if (!valid) throw new InvalidResetCodeError('Código inválido o vencido.');
    return { resetGrant };
  }
}
