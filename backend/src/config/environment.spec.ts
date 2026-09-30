import { ConfigService } from '@nestjs/config';
import { configurationFrom, EnvironmentConfigurationError, readSmtpConfiguration, validateEnvironment } from './environment';
import { CryptoRefreshTokenService } from '../modules/identity/infrastructure/crypto-refresh-token.service';
import { CryptoPasswordResetTokenService } from '../modules/identity/infrastructure/crypto-password-reset-token.service';
import { CryptoPasswordResetOtpService } from '../modules/identity/infrastructure/crypto-password-reset-otp.service';
import { CryptoEmailVerificationTokenService } from '../modules/identity/infrastructure/crypto-email-verification-token.service';

const production = (): Record<string, unknown> => ({
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://synthetic:synthetic@db.internal/top?schema=public&sslmode=require&connection_limit=5',
  JWT_ACCESS_SECRET: 'J'.repeat(32), PASSWORD_RESET_OTP_SECRET: 'O'.repeat(32),
  APP_PUBLIC_URL: 'https://app.top.test', CORS_ORIGIN: 'https://app.top.test,https://admin.top.test:8443',
  EMAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: 'smtp.internal', SMTP_FROM: 'TOP <noreply@top.test>',
  S3_ENDPOINT: 'https://storage.top.test', S3_REGION: 'auto', S3_BUCKET: 'top-assets',
  S3_ACCESS_KEY: 'synthetic-access', S3_SECRET_KEY: 'synthetic-storage-secret',
});
const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'PASSWORD_RESET_OTP_SECRET', 'APP_PUBLIC_URL', 'CORS_ORIGIN', 'EMAIL_DELIVERY_MODE', 'SMTP_HOST', 'SMTP_FROM', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];
const ttlKeys = ['REFRESH_TOKEN_TTL_SECONDS', 'PASSWORD_RESET_TTL_SECONDS', 'PASSWORD_RESET_OTP_TTL_SECONDS', 'EMAIL_VERIFICATION_TTL_SECONDS'];
const cooldownKeys = ['PASSWORD_RESET_OTP_RESEND_SECONDS', 'EMAIL_VERIFICATION_RESEND_SECONDS'];

describe('Configuración de arranque', () => {
  it('acepta producción completa y conserva parámetros PostgreSQL', () => {
    const input = production();
    const validated = validateEnvironment(input);
    expect(validated.DATABASE_URL).toBe(input.DATABASE_URL);
    expect(validated).toMatchObject({ NODE_ENV: 'production', PORT: 3000, EMAIL_DELIVERY_MODE: 'smtp', S3_FORCE_PATH_STYLE: false, S3_PUBLIC_ENDPOINT: input.S3_ENDPOINT, REFRESH_TOKEN_TTL_SECONDS: 2592000, PASSWORD_RESET_TTL_SECONDS: 1800, PASSWORD_RESET_OTP_TTL_SECONDS: 600, PASSWORD_RESET_OTP_RESEND_SECONDS: 60, EMAIL_VERIFICATION_TTL_SECONDS: 86400, EMAIL_VERIFICATION_RESEND_SECONDS: 60 });
    expect(validated.CORS_ORIGINS).toEqual(['https://app.top.test', 'https://admin.top.test:8443']);
  });

  it.each(required.flatMap((key) => [undefined, '', ' ', 'cambiar-por-un-placeholder-muy-largo-de-ejemplo'].map((value) => [key, value] as const)))('rechaza %s ausente/vacío/placeholder (%s)', (key, value) => {
    expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
  });

  it.each(['staging', '', 'Production', 'production ', null])('rechaza NODE_ENV desconocido (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), NODE_ENV: value })).toThrow('NODE_ENV');
  });

  it.each(['development', 'test', undefined])('preserva desarrollo/test y defaults (%s)', (env) => {
    const validated = validateEnvironment({ NODE_ENV: env, DATABASE_URL: 'postgresql://top:top@localhost/top_test?host=/tmp', JWT_ACCESS_SECRET: 'local-short-secret', CORS_ORIGIN: 'http://localhost:3001' });
    expect(validated.NODE_ENV).toBe(env ?? 'development');
    expect(validated.EMAIL_DELIVERY_MODE).toBe('console');
    expect(validated.APP_PUBLIC_URL).toBe('http://localhost:3001');
    expect(validated.PASSWORD_RESET_OTP_SECRET).toBe('development-only-reset-secret');
    expect(validated.CORS_ORIGINS).toEqual(['http://localhost:3001']);
  });

  it.each(['JWT_ACCESS_SECRET', 'PASSWORD_RESET_OTP_SECRET'])('mide bytes UTF-8, preserva contenido y rechaza secreto corto (%s)', (key) => {
    expect(() => validateEnvironment({ ...production(), [key]: 'x'.repeat(31) })).toThrow(key);
    const secret = 'ñ'.repeat(16);
    expect(validateEnvironment({ ...production(), [key]: secret })[key]).toBe(secret);
    expect(() => validateEnvironment({ ...production(), [key]: ` ${'x'.repeat(32)} ` })).toThrow(key);
  });

  it.each(['development-only-jwt-secret-long-enough', 'ci-only-jwt-access-secret-not-for-production', 'cambiar-por-un-secreto-seguro-local', 'your-secret-value-that-is-long-enough'])('rechaza secreto conocido de desarrollo/ejemplo (%s)', (secret) => {
    expect(() => validateEnvironment({ ...production(), JWT_ACCESS_SECRET: secret })).toThrow('JWT_ACCESS_SECRET');
  });

  it('rechaza reutilizar secreto JWT como OTP', () => {
    const input = production();
    expect(() => validateEnvironment({ ...input, PASSWORD_RESET_OTP_SECRET: input.JWT_ACCESS_SECRET })).toThrow('independiente');
  });

  it.each(['mysql://u:p@host/db', 'postgresql://host', 'postgresql://host/', 'postgresql://host:65536/db', 'postgresql://host/db#fragment', 'bad-synthetic-database-url'])('rechaza conexión PostgreSQL inválida (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), DATABASE_URL: value })).toThrow('DATABASE_URL');
  });

  it.each(['postgres://u:p@localhost/top?schema=custom&pgbouncer=true', 'postgresql://u:p@localhost/top?host=/cloudsql/project:region:instance&sslmode=disable'])('preserva conexiones Prisma sin imponer networking (%s)', (value) => {
    expect(validateEnvironment({ ...production(), DATABASE_URL: value }).DATABASE_URL).toBe(value);
  });

  it.each(['http://app.top.test', 'https://user:password@app.top.test', 'https://app.top.test?token=synthetic', 'https://app.top.test#token', 'https://app.top.test?', 'https://app.top.test#', 'invalid-url'])('rechaza APP_PUBLIC_URL inválida (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), APP_PUBLIC_URL: value })).toThrow('APP_PUBLIC_URL');
  });

  it.each(['*', 'null', 'https://*.top.test', 'http://app.top.test', 'https://app.top.test/path', 'https://app.top.test/foo/..', 'https:app.top.test', 'https:/app.top.test', 'https:///app.top.test', 'https://user:pass@app.top.test', 'https://app.top.test?q=x', 'https://app.top.test#x', ',https://app.top.test', 'https://app.top.test,', 'https://app.top.test,,https://admin.top.test'])('rechaza CORS_ORIGIN inseguro (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), CORS_ORIGIN: value })).toThrow('CORS_ORIGIN');
  });

  it.each(['PORT', 'SMTP_PORT'])('valida puertos y admite límites (%s)', (key) => {
    for (const value of ['0', '65536', '2.5', '-1', 'x', '', ' 3000', null]) expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
    for (const value of ['1', '65535']) expect(validateEnvironment({ ...production(), [key]: value })[key]).toBe(Number(value));
  });

  it.each(ttlKeys)('rechaza overrides TTL inválidos y conserva positivo (%s)', (key) => {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '1.5', '', '0x10', '1e3', '9007199254740992', null]) expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
    expect(validateEnvironment({ ...production(), [key]: '1' })[key]).toBe(1);
  });

  it.each([
    ['REFRESH_TOKEN_TTL_SECONDS', (config: ConfigService) => new CryptoRefreshTokenService(config)],
    ['PASSWORD_RESET_TTL_SECONDS', (config: ConfigService) => new CryptoPasswordResetTokenService(config)],
    ['PASSWORD_RESET_OTP_TTL_SECONDS', (config: ConfigService) => new CryptoPasswordResetOtpService(config)],
    ['EMAIL_VERIFICATION_TTL_SECONDS', (config: ConfigService) => new CryptoEmailVerificationTokenService(config)],
  ] as const)('acepta la frontera DateTime de Prisma y rechaza el siguiente segundo (%s)', (key, createService) => {
    const now = new Date('2026-09-30T12:00:00.123Z');
    const maximum = Math.floor((253_402_300_799_999 - now.getTime()) / 1000);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    try {
      for (const value of [String(maximum), maximum]) {
        const validated = validateEnvironment({ ...production(), [key]: value });
        const expiration = createService(new ConfigService(validated)).expiresAt(now);
        expect(validated[key]).toBe(maximum);
        expect(Number.isSafeInteger(maximum * 1000)).toBe(true);
        expect(expiration.getTime()).toBe(now.getTime() + maximum * 1000);
        expect(() => expiration.toISOString()).not.toThrow();
        expect(expiration.toISOString()).toBe('9999-12-31T23:59:59.123Z');
      }
      const dateMaximum = Math.floor((8_640_000_000_000_000 - now.getTime()) / 1000);
      for (const value of [maximum + 1, String(maximum + 1), dateMaximum, dateMaximum + 1, '8640000000000', String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER]) {
        expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
      }
      expect(new Date(now.getTime() + (maximum + 1) * 1000).toISOString()).toBe('+010000-01-01T00:00:00.123Z');
      expect(new Date(now.getTime() + (dateMaximum + 1) * 1000).getTime()).toBeNaN();
    } finally {
      clock.mockRestore();
    }
  });

  it.each(cooldownKeys)('rechaza cooldown inválido y permite cero (%s)', (key) => {
    for (const value of ['-1', 'NaN', 'Infinity', '1.5', '', null]) expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
    expect(validateEnvironment({ ...production(), [key]: '0' })[key]).toBe(0);
  });

  it('console no exige configuración SMTP en desarrollo/test', () => {
    expect(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/top_test', JWT_ACCESS_SECRET: 'test', EMAIL_DELIVERY_MODE: 'console', SMTP_HOST: '', SMTP_PORT: 'invalid' }).EMAIL_DELIVERY_MODE).toBe('console');
    expect(() => validateEnvironment({ ...production(), EMAIL_DELIVERY_MODE: 'console' })).toThrow('EMAIL_DELIVERY_MODE');
  });

  it.each([{ SMTP_USER: 'synthetic-user' }, { SMTP_PASSWORD: 'synthetic-password' }, { SMTP_USER: '', SMTP_PASSWORD: '' }])('rechaza pareja SMTP incompleta/vacía (%j)', (auth) => {
    expect(() => validateEnvironment({ ...production(), ...auth })).toThrow(/SMTP_USER|SMTP_PASSWORD/);
  });

  it('SMTP permite pareja ausente/presente y fuerza TLS directo o STARTTLS', () => {
    const input = production();
    expect(readSmtpConfiguration(new ConfigService(input))).toMatchObject({ port: 587, secure: false, requireTLS: true, auth: undefined });
    expect(readSmtpConfiguration(new ConfigService({ ...input, SMTP_PORT: '465', SMTP_USER: 'synthetic-user', SMTP_PASSWORD: 'synthetic-password' }))).toMatchObject({ secure: true, requireTLS: false, auth: { user: 'synthetic-user', pass: 'synthetic-password' } });
  });

  it.each(['https://smtp.top.test', 'smtp.top.test:587', 'bad host', 'user@smtp.top.test', 'smtp..top.test', 'smtp-.top.test', `${'a'.repeat(64)}.top.test`])('rechaza host SMTP inválido (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), SMTP_HOST: value })).toThrow('SMTP_HOST');
  });

  it.each(['invalid-from', 'a@top.test,b@top.test', 'first@top.test, TOP <second@top.test>', 'grupo: a@top.test;', 'TOP <a@top.test>\r\nBcc: b@top.test'])('rechaza remitente SMTP inválido (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), SMTP_FROM: value })).toThrow('SMTP_FROM');
  });

  it.each(['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT'])('valida endpoints efectivos y exige HTTPS (%s)', (key) => {
    for (const value of ['', 'invalid', 'http://storage.top.test', 'https://u:p@storage.top.test', 'https://storage.top.test?key=synthetic', 'https://storage.top.test#x']) expect(() => validateEnvironment({ ...production(), [key]: value })).toThrow(key);
  });

  it('admite MinIO local y booleanos exactos, preserva fallback público', () => {
    const input = { ...production(), NODE_ENV: 'development', S3_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: 'true' };
    expect(validateEnvironment(input)).toMatchObject({ S3_ENDPOINT: 'http://localhost:9000', S3_PUBLIC_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: true });
    expect(validateEnvironment({ ...input, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false);
    for (const value of ['', '1', 'TRUE', 'yes', null]) expect(() => validateEnvironment({ ...input, S3_FORCE_PATH_STYLE: value })).toThrow('S3_FORCE_PATH_STYLE');
  });

  it.each(['a', 'A-bucket', 'invalid_bucket', 'a..bucket', 'a-.bucket', '192.168.0.1'])('rechaza bucket inválido (%s)', (value) => {
    expect(() => validateEnvironment({ ...production(), S3_BUCKET: value })).toThrow('S3_BUCKET');
  });

  it('la normalización de URLs es estable al consumir configuración ya validada', () => {
    const validated = validateEnvironment({ ...production(), APP_PUBLIC_URL: 'https://app.top.test/base///', S3_ENDPOINT: 'https://storage.top.test/proxy///' });
    expect(configurationFrom(new ConfigService(validated))).toEqual(validated);
  });

  it('no expone valores sintéticos identificables en errores ni stacks', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER_93724';
    const cases = [{ DATABASE_URL: `postgresql://user:${marker}@host` }, { APP_PUBLIC_URL: `https://user:${marker}@app.top.test` }, { JWT_ACCESS_SECRET: marker }, { SMTP_FROM: marker }, { S3_PUBLIC_ENDPOINT: `https://u:${marker}@storage.top.test` }];
    for (const override of cases) {
      try { validateEnvironment({ ...production(), ...override }); throw new Error('La configuración inválida fue aceptada.'); }
      catch (error: unknown) {
        expect(error).toBeInstanceOf(EnvironmentConfigurationError);
        expect(String(error)).not.toContain(marker);
        expect((error as Error).stack).not.toContain(marker);
      }
    }
  });
});
