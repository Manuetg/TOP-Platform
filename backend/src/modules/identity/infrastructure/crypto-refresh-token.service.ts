import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenExpiration, RefreshTokenGenerator, RefreshTokenHasher } from '../domain/refresh-token';

export const refreshTokenTtlSeconds = 2_592_000;

@Injectable()
export class CryptoRefreshTokenService implements RefreshTokenGenerator, RefreshTokenHasher, RefreshTokenExpiration {
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    const configured = config.get<string>('REFRESH_TOKEN_TTL_SECONDS');
    this.ttlSeconds = configured === undefined ? refreshTokenTtlSeconds : Number(configured);
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds <= 0) {
      throw new Error('REFRESH_TOKEN_TTL_SECONDS debe ser un entero positivo.');
    }
  }

  generate(): string { return randomBytes(32).toString('base64url'); }
  hash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  expiresAt(now: Date): Date { return new Date(now.getTime() + this.ttlSeconds * 1000); }
}
