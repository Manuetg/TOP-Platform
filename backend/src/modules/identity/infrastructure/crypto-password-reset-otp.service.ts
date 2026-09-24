import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomBytes, createHash } from 'node:crypto';
@Injectable()
export class CryptoPasswordResetOtpService {
  readonly ttlSeconds: number;
  readonly resendSeconds: number;
  private readonly secret: string;
  constructor(config: ConfigService) { this.ttlSeconds = Number(config.get<string>('PASSWORD_RESET_OTP_TTL_SECONDS') ?? 600); this.resendSeconds = Number(config.get<string>('PASSWORD_RESET_OTP_RESEND_SECONDS') ?? 60); this.secret = config.get<string>('PASSWORD_RESET_OTP_SECRET') ?? 'development-only-reset-secret'; if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds <= 0) throw new Error('PASSWORD_RESET_OTP_TTL_SECONDS debe ser positivo.'); }
  generateCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
  digest(_context: string, code: string): string { return createHmac('sha256', this.secret).update(code).digest('hex'); }
  generateGrant(): string { return randomBytes(32).toString('base64url'); }
  hashGrant(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  expiresAt(now: Date): Date { return new Date(now.getTime() + this.ttlSeconds * 1000); }
}
