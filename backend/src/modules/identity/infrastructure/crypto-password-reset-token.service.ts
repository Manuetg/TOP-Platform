import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

export const passwordResetTokenTtlSeconds = 1800;

@Injectable()
export class CryptoPasswordResetTokenService {
  readonly ttlSeconds: number;
  constructor(config: ConfigService) {
    const configured = config.get<string>('PASSWORD_RESET_TTL_SECONDS');
    this.ttlSeconds = configured === undefined ? passwordResetTokenTtlSeconds : Number(configured);
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds <= 0) throw new Error('PASSWORD_RESET_TTL_SECONDS debe ser un entero positivo.');
  }
  generate(): string { return randomBytes(32).toString('base64url'); }
  hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  expiresAt(now: Date): Date { return new Date(now.getTime() + this.ttlSeconds * 1000); }
}
