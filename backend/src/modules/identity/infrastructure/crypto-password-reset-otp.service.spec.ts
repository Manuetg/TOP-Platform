import { ConfigService } from '@nestjs/config';
import { CryptoPasswordResetOtpService } from './crypto-password-reset-otp.service';
describe('CryptoPasswordResetOtpService', () => {
  const service = () => new CryptoPasswordResetOtpService(new ConfigService({ PASSWORD_RESET_OTP_SECRET: 'test-secret' }));
  it('generates six numeric digits with HMAC digests', () => { const crypto = service(); const code = crypto.generateCode(); expect(code).toMatch(/^\d{6}$/); expect(crypto.digest('context', code)).toHaveLength(64); expect(crypto.digest('context', code)).toBe(crypto.digest('context', code)); });
  it('uses configured TTL and resend interval', () => { const crypto = new CryptoPasswordResetOtpService(new ConfigService({ PASSWORD_RESET_OTP_TTL_SECONDS: '600', PASSWORD_RESET_OTP_RESEND_SECONDS: '60', PASSWORD_RESET_OTP_SECRET: 'secret' })); const now = new Date('2026-01-01T00:00:00Z'); expect(crypto.expiresAt(now).getTime() - now.getTime()).toBe(600000); expect(crypto.resendSeconds).toBe(60); });
});
