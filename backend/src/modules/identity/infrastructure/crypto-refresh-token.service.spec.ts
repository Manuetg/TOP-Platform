import { ConfigService } from '@nestjs/config';
import { CryptoRefreshTokenService, refreshTokenTtlSeconds } from './crypto-refresh-token.service';

describe('CryptoRefreshTokenService', () => {
  it('genera tokens opacos de 256 bits y hashes deterministas', () => {
    const service = new CryptoRefreshTokenService(new ConfigService());
    const first = service.generate();
    const second = service.generate();
    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
    expect(service.hash(first)).toHaveLength(64);
    expect(service.hash(first)).toBe(service.hash(first));
    expect(service.hash(second)).not.toBe(service.hash(first));
  });

  it('usa 30 días por defecto y valida la configuración', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(new CryptoRefreshTokenService(new ConfigService()).expiresAt(now)).toEqual(new Date(now.getTime() + refreshTokenTtlSeconds * 1000));
    expect(() => new CryptoRefreshTokenService(new ConfigService({ REFRESH_TOKEN_TTL_SECONDS: '0' }))).toThrow('REFRESH_TOKEN_TTL_SECONDS debe ser un entero positivo.');
  });
});
