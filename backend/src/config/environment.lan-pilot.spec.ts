import { ConfigService } from '@nestjs/config';
import { configurationFrom, EnvironmentConfigurationError, readAppPublicUrl, readEmailDeliveryMode, readS3Configuration, validateEnvironment } from './environment';

const pilotDatabaseCredentials = `postgresql://top_pilot_app:${'A'.repeat(32)}`;
const pilot = (): Record<string, unknown> => ({
  NODE_ENV: 'production', TOP_DEPLOYMENT_PROFILE: 'lan-pilot', PORT: '3000',
  DATABASE_URL: `${pilotDatabaseCredentials}@postgres:5432/top_pilot?schema=public`,
  JWT_ACCESS_SECRET: 'J'.repeat(32), PASSWORD_RESET_OTP_SECRET: 'O'.repeat(32),
  APP_PUBLIC_URL: 'http://192.168.1.20:3001', CORS_ORIGIN: 'http://192.168.1.20:3001',
  EMAIL_DELIVERY_MODE: 'disabled',
  S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://192.168.1.20:3001',
  S3_REGION: 'us-east-1', S3_BUCKET: 'top-pilot-assets',
  S3_ACCESS_KEY: 'synthetic-access', S3_SECRET_KEY: 'synthetic-storage-secret', S3_FORCE_PATH_STYLE: 'true',
});

const config = (values: Record<string, unknown>): ConfigService => {
  const reader = new ConfigService(values);
  jest.spyOn(reader, 'get').mockImplementation((key: string) => values[key]);
  return reader;
};

describe('Perfil LAN piloto explícito', () => {
  it('valida el perfil y conserva el snapshot al consumirlo nuevamente', () => {
    const validated = validateEnvironment(pilot());
    const reader = config(validated);
    expect(validated).toMatchObject({ NODE_ENV: 'production', TOP_DEPLOYMENT_PROFILE: 'lan-pilot', PORT: 3000, EMAIL_DELIVERY_MODE: 'disabled', S3_FORCE_PATH_STYLE: true });
    expect(validated.CORS_ORIGINS).toEqual(['http://192.168.1.20:3001']);
    expect(configurationFrom(reader)).toEqual(validated);
    expect(readAppPublicUrl(reader)).toBe(validated.APP_PUBLIC_URL);
    expect(readEmailDeliveryMode(reader)).toBe('disabled');
    expect(readS3Configuration(reader)).toMatchObject({ endpoint: 'http://minio:9000', publicEndpoint: validated.APP_PUBLIC_URL, forcePathStyle: true });
  });

  it.each(['10.1.2.3', '172.16.0.10', '172.31.255.10', '192.168.50.20'])('acepta exclusivamente las familias RFC1918: %s', (ip) => {
    const origin = `http://${ip}:3001`;
    expect(validateEnvironment({ ...pilot(), APP_PUBLIC_URL: origin, CORS_ORIGIN: origin, S3_PUBLIC_ENDPOINT: origin }).APP_PUBLIC_URL).toBe(origin);
  });

  it.each(['development', 'test', undefined])('no permite activar lan-pilot fuera de production: %s', (env) => {
    expect(() => validateEnvironment({ ...pilot(), NODE_ENV: env })).toThrow('TOP_DEPLOYMENT_PROFILE');
  });

  it.each(['', 'pilot', 'LAN-PILOT', 'lan-pilot ', null])('rechaza perfiles desconocidos: %s', (profile) => {
    expect(() => validateEnvironment({ ...pilot(), TOP_DEPLOYMENT_PROFILE: profile })).toThrow('TOP_DEPLOYMENT_PROFILE');
  });

  it.each(['APP_PUBLIC_URL', 'CORS_ORIGIN', 'S3_PUBLIC_ENDPOINT'])('rechaza origen ausente, público o no canónico: %s', (key) => {
    const values = [undefined, '', 'http://127.0.0.1:3001', 'http://169.254.1.2:3001', 'http://172.15.0.1:3001', 'http://172.32.0.1:3001', 'http://8.8.8.8:3001', 'http://localhost:3001', 'http://[fd00::1]:3001', 'http://192.168.1.20:3000', 'https://192.168.1.20:3001', 'http://192.168.1.20:03001', 'http://192.168.001.20:3001', 'http://0xc0a80114:3001', 'http://3232235796:3001', 'http://0300.0250.01.024:3001', 'http://192.168.1:3001', 'http://192.168.1.20:3001/', 'http://192.168.1.20:3001/path', 'http://192.168.1.20:3001/..', 'http://192.168.1.20:3001?', 'http://192.168.1.20:3001#', 'http://u:p@192.168.1.20:3001', 'http://192.168.1.20:3001,http://192.168.1.21:3001'];
    for (const value of values) expect(() => validateEnvironment({ ...pilot(), [key]: value })).toThrow(key);
  });

  it.each(['CORS_ORIGIN', 'S3_PUBLIC_ENDPOINT'])('no acepta otro origen privado en %s', (key) => {
    expect(() => validateEnvironment({ ...pilot(), [key]: 'http://192.168.1.21:3001' })).toThrow(key);
  });

  it.each([undefined, '', 'console', 'smtp'])('obliga correo disabled explícito: %s', (mode) => {
    expect(() => validateEnvironment({ ...pilot(), EMAIL_DELIVERY_MODE: mode })).toThrow('EMAIL_DELIVERY_MODE');
  });

  it('no consulta ni requiere SMTP al seleccionar disabled', () => {
    expect(validateEnvironment({ ...pilot(), SMTP_HOST: '', SMTP_PORT: 'invalid', SMTP_PASSWORD: 'not-used' }).EMAIL_DELIVERY_MODE).toBe('disabled');
  });

  it.each([undefined, '', 'http://localhost:9000', 'http://192.168.1.20:9000', 'https://minio:9000', 'http://minio:9000/', 'http://MINIO:9000', 'http://minio:9000?'])('MinIO solo admite el endpoint Docker exacto: %s', (endpoint) => {
    expect(() => validateEnvironment({ ...pilot(), S3_ENDPOINT: endpoint })).toThrow('S3_ENDPOINT');
  });

  it.each([undefined, false, 'false'])('obliga path style explícito: %s', (value) => {
    expect(() => validateEnvironment({ ...pilot(), S3_FORCE_PATH_STYLE: value })).toThrow('S3_FORCE_PATH_STYLE');
  });

  it.each(['api', 'health', 'assets', 'auth', 'top-assets', 'top-pilot-', 'top-pilot-files.v1', 'top-pilot-files-'])('el bucket piloto usa un prefijo propio sin colisionar con rutas gateway: %s', (bucket) => {
    expect(() => validateEnvironment({ ...pilot(), S3_BUCKET: bucket })).toThrow('S3_BUCKET');
  });

  it.each([`${pilotDatabaseCredentials}@localhost:5432/top_pilot`, `${pilotDatabaseCredentials}@postgres:5433/top_pilot`, `${pilotDatabaseCredentials}@postgres/top_pilot`, `${pilotDatabaseCredentials}@postgres:5432/top`, `${pilotDatabaseCredentials}@POSTGRES:5432/top_pilot`, 'postgresql://postgres:5432/top_pilot', `${pilotDatabaseCredentials}@postgres:5432/top_pilot?host=/tmp`, `${pilotDatabaseCredentials}@postgres:5432/top_pilot?schema=public&host=external`, `${pilotDatabaseCredentials}@postgres:5432/top_pilot?schema=private`])('aísla destino DB y bloquea overrides de conexión', (url) => {
    expect(() => validateEnvironment({ ...pilot(), DATABASE_URL: url })).toThrow('DATABASE_URL');
  });

  it('mantiene secretos fuertes e independientes y puerto API interno fijo', () => {
    for (const key of ['JWT_ACCESS_SECRET', 'PASSWORD_RESET_OTP_SECRET']) expect(() => validateEnvironment({ ...pilot(), [key]: 'short' })).toThrow(key);
    expect(() => validateEnvironment({ ...pilot(), PASSWORD_RESET_OTP_SECRET: 'J'.repeat(32) })).toThrow('PASSWORD_RESET_OTP_SECRET');
    expect(() => validateEnvironment({ ...pilot(), PORT: '3001' })).toThrow('PORT');
  });

  it.each(['top_pilot', 'postgres', 'synthetic', 'TOP_PILOT_APP', 'top%5Fpilot%5Fapp'])('la API rechaza propietario, bootstrap y alias del rol limitado: %s', (role) => {
    expect(() => validateEnvironment({ ...pilot(), DATABASE_URL: `postgresql://${role}:${'A'.repeat(32)}@postgres:5432/top_pilot` })).toThrow('DATABASE_URL');
  });

  it.each(['short', 'example-password-must-be-replaced-0000', '%XX'])('no admite una contraseña débil, placeholder o escape inválido: %s', (password) => {
    expect(() => validateEnvironment({ ...pilot(), DATABASE_URL: `postgresql://top_pilot_app:${password}@postgres:5432/top_pilot` })).toThrow('DATABASE_URL');
  });

  it.each(['postgresql', 'postgres'])('acepta exclusivamente el rol técnico limitado con contraseña propia: %s', (protocol) => {
    const url = `${protocol}://top_pilot_app:${'A'.repeat(32)}@postgres:5432/top_pilot`;
    expect(validateEnvironment({ ...pilot(), DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('standard continúa exigiendo HTTPS/SMTP; omitir perfil no activa la excepción HTTP', () => {
    for (const profile of [undefined, 'standard']) {
      expect(() => validateEnvironment({ ...pilot(), TOP_DEPLOYMENT_PROFILE: profile })).toThrow('EMAIL_DELIVERY_MODE');
      expect(() => validateEnvironment({ ...pilot(), TOP_DEPLOYMENT_PROFILE: profile, EMAIL_DELIVERY_MODE: 'smtp' })).toThrow('CORS_ORIGIN');
    }
  });

  it('los errores no incluyen secretos ni datos recibidos', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER_93724';
    for (const override of [{ DATABASE_URL: `postgresql://synthetic:${marker}@external:5432/top_pilot` }, { APP_PUBLIC_URL: `http://synthetic:${marker}@192.168.1.20:3001` }, { TOP_DEPLOYMENT_PROFILE: marker }]) {
      try { validateEnvironment({ ...pilot(), ...override }); throw new Error('Configuración inválida aceptada.'); }
      catch (error: unknown) {
        expect(error).toBeInstanceOf(EnvironmentConfigurationError);
        expect(String(error)).not.toContain(marker);
        expect((error as Error).stack).not.toContain(marker);
      }
    }
  });
});
