import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createEmailSender, IdentityModule } from './identity.module';
import { EMAIL_SENDER } from './domain/email-sender';
import { ConsoleEmailSender } from './infrastructure/console-email-sender';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender';

describe('selección de correo en IdentityModule', () => {
  const config = (values: Record<string, unknown>): ConfigService => {
    const service = new ConfigService(values);
    jest.spyOn(service, 'get').mockImplementation((key: string) => values[key]);
    return service;
  };

  it('resuelve el módulo en modo console sin exigir configuración SMTP', async () => {
    const module = await Test.createTestingModule({ imports: [IdentityModule] })
      .overrideProvider(ConfigService)
      .useValue(config({ NODE_ENV: 'test', EMAIL_DELIVERY_MODE: 'console', JWT_ACCESS_SECRET: 'unit-test-secret', DATABASE_URL: 'postgresql://test:test@localhost:5432/top_test' }))
      .compile();
    expect(module.get(EMAIL_SENDER)).toBeInstanceOf(ConsoleEmailSender);
    expect(() => module.get(SmtpEmailSender)).toThrow();
    await module.close();
  });

  it.each(['development', 'test'])('conserva console por omisión en %s', (environment) => {
    expect(createEmailSender(config({ NODE_ENV: environment }))).toBeInstanceOf(ConsoleEmailSender);
  });

  it.each([undefined, '', 'console', 'unknown'])('rechaza correo no SMTP en producción: %s', (mode) => {
    expect(() => createEmailSender(config({ NODE_ENV: 'production', EMAIL_DELIVERY_MODE: mode }))).toThrow(/EMAIL_DELIVERY_MODE/);
  });

  it('selecciona SMTP válido sin enviar correo durante la construcción', () => {
    expect(createEmailSender(config({ NODE_ENV: 'production', EMAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: 'smtp.top.test', SMTP_FROM: 'no-reply@top.test' }))).toBeInstanceOf(SmtpEmailSender);
  });

  it('rechaza SMTP incompleto también en desarrollo', () => {
    expect(() => createEmailSender(config({ NODE_ENV: 'development', EMAIL_DELIVERY_MODE: 'smtp' }))).toThrow(/SMTP_/);
  });
});
