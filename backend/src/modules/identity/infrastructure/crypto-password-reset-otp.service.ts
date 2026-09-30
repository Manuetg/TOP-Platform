import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomBytes, createHash } from 'node:crypto';
import { readIntegerConfiguration, readPasswordResetOtpSecret } from '../../../config/environment';
@Injectable()
export class CryptoPasswordResetOtpService {
  readonly ttlSeconds: number;
  readonly resendSeconds: number;
  private readonly secret: string;
  constructor(config: ConfigService) {
    this.ttlSeconds = readIntegerConfiguration(config, 'PASSWORD_RESET_OTP_TTL_SECONDS', 600);
    this.resendSeconds = readIntegerConfiguration(config, 'PASSWORD_RESET_OTP_RESEND_SECONDS', 60, 0);
    this.secret = readPasswordResetOtpSecret(config);
  }
  generateCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
  digest(_context: string, code: string): string { return createHmac('sha256', this.secret).update(code).digest('hex'); }
  generateGrant(): string { return randomBytes(32).toString('base64url'); }
  hashGrant(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  expiresAt(now: Date): Date { return new Date(now.getTime() + this.ttlSeconds * 1000); }
}
