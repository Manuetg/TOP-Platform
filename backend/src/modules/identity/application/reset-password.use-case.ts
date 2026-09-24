import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { PASSWORD_RESET_TOKEN_REPOSITORY, type PasswordResetTokenRepository } from '../domain/password-reset-token.repository';
import { CryptoPasswordResetTokenService } from '../infrastructure/crypto-password-reset-token.service';

export class InvalidResetPasswordInputError extends Error {}
export class InvalidPasswordResetTokenError extends Error {}

@Injectable()
export class ResetPasswordUseCase {
  constructor(@Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly tokens: PasswordResetTokenRepository, @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher, private readonly crypto: CryptoPasswordResetTokenService) {}
  async execute(input: { resetGrant: string; password: string }): Promise<void> {
    if (typeof input?.resetGrant !== 'string' || !input.resetGrant.trim() || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new InvalidResetPasswordInputError('El código y la contraseña son obligatorios; la contraseña debe tener entre 12 y 128 caracteres.');
    const passwordHash = await this.hasher.hash(input.password);
    const valid = await this.tokens.consumeAndResetPassword({ tokenHash: this.crypto.hash(input.resetGrant.trim()), passwordHash, now: new Date() });
    if (!valid) throw new InvalidPasswordResetTokenError('El enlace de recuperación no es válido o expiró.');
  }
}
