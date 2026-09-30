import { ConfigService } from '@nestjs/config';
import { CryptoPasswordResetOtpService } from './crypto-password-reset-otp.service';
import { createHmac } from 'node:crypto';
describe('CryptoPasswordResetOtpService', () => {
  const config = (values: Record<string, unknown>): ConfigService => {
    const result = new ConfigService(values);
    jest.spyOn(result, 'get').mockImplementation((key: string) => values[key]);
    return result;
  };
  const service = () => new CryptoPasswordResetOtpService(config({ PASSWORD_RESET_OTP_SECRET: 'test-secret' }));
  it('generates six numeric digits with HMAC digests', () => { const crypto = service(); const code = crypto.generateCode(); expect(code).toMatch(/^\d{6}$/); expect(crypto.digest('context', code)).toHaveLength(64); expect(crypto.digest('context', code)).toBe(crypto.digest('context', code)); });
  it('uses configured TTL and resend interval', () => { const crypto = new CryptoPasswordResetOtpService(config({ PASSWORD_RESET_OTP_TTL_SECONDS: '600', PASSWORD_RESET_OTP_RESEND_SECONDS: '60', PASSWORD_RESET_OTP_SECRET: 'secret' })); const now = new Date('2026-01-01T00:00:00Z'); expect(crypto.expiresAt(now).getTime() - now.getTime()).toBe(600000); expect(crypto.resendSeconds).toBe(60); });
  it.each(['development', 'test'])('conserva secreto local por omisión en %s', (environment) => {
    const crypto = new CryptoPasswordResetOtpService(config({ NODE_ENV: environment }));
    expect(crypto.digest('context', '123456')).toBe(createHmac('sha256', 'development-only-reset-secret').update('123456').digest('hex'));
  });
  it.each([undefined, '', 'short-secret', 'development-only-reset-secret', 'change-me-development-placeholder-123456789'])('rechaza secreto OTP inseguro en producción: %s', (secret) => {
    expect(() => new CryptoPasswordResetOtpService(config({ NODE_ENV: 'production', PASSWORD_RESET_OTP_SECRET: secret }))).toThrow(/PASSWORD_RESET_OTP_SECRET/);
  });
  it('conserva el contenido exacto del secreto de producción sin transformarlo', () => {
    const secret = '8Db@tA7k!P2sV6nR9xL4yZ0mQ5hC3wU1';
    const crypto = new CryptoPasswordResetOtpService(config({ NODE_ENV: 'production', PASSWORD_RESET_OTP_SECRET: secret }));
    expect(crypto.digest('context', '123456')).toBe(createHmac('sha256', secret).update('123456').digest('hex'));
  });
  it.each(['0', '-1', '1.5', 'invalid', ''])('rechaza TTL inválido: %s', (value) => {
    expect(() => new CryptoPasswordResetOtpService(config({ PASSWORD_RESET_OTP_TTL_SECONDS: value }))).toThrow(/PASSWORD_RESET_OTP_TTL_SECONDS/);
  });
  it.each(['-1', '1.5', 'invalid', ''])('rechaza cooldown inválido: %s', (value) => {
    expect(() => new CryptoPasswordResetOtpService(config({ PASSWORD_RESET_OTP_RESEND_SECONDS: value }))).toThrow(/PASSWORD_RESET_OTP_RESEND_SECONDS/);
  });
  it('conserva cooldown cero explícito', () => {
    expect(new CryptoPasswordResetOtpService(config({ PASSWORD_RESET_OTP_RESEND_SECONDS: 0 })).resendSeconds).toBe(0);
  });
});
