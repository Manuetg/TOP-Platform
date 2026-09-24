import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class CryptoEmailVerificationTokenService {
  readonly ttlSeconds: number;
  constructor(config: ConfigService) {
    this.ttlSeconds = Number(config.get<string>('EMAIL_VERIFICATION_TTL_SECONDS') ?? 86400);
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds <= 0) throw new Error('EMAIL_VERIFICATION_TTL_SECONDS debe ser positivo.');
  }
  generate(): string { return randomBytes(32).toString('base64url'); }
  hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  expiresAt(now: Date): Date { return new Date(now.getTime() + this.ttlSeconds * 1000); }
}
