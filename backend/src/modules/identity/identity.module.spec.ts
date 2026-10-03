import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createEmailSender, IdentityModule } from './identity.module';
import { EMAIL_SENDER } from './domain/email-sender';
import { ConsoleEmailSender } from './infrastructure/console-email-sender';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender';
import { GetUserProfileUseCase } from './application/get-user-profile.use-case';
import { UpdateUserProfileUseCase } from './application/update-user-profile.use-case';
import { USER_PROFILE_CHANGE_REPOSITORY } from './domain/user-profile-change.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { DisabledEmailSender } from './infrastructure/disabled-email-sender';

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
    expect(module.get(GetUserProfileUseCase)).toBeInstanceOf(GetUserProfileUseCase);
    expect(module.get(UpdateUserProfileUseCase)).toBeInstanceOf(UpdateUserProfileUseCase);
    expect(module.get(USER_PROFILE_CHANGE_REPOSITORY)).toBe(module.get(PrismaUserRepository));
    await module.close();
  });

  it.each(['development', 'test'])('conserva console por omisión en %s', (environment) => {
    expect(createEmailSender(config({ NODE_ENV: environment }))).toBeInstanceOf(ConsoleEmailSender);
  });

  it('selecciona disabled en el piloto sin construir SMTP ni console', () => {
    expect(createEmailSender(config({ NODE_ENV: 'production', TOP_DEPLOYMENT_PROFILE: 'lan-pilot', EMAIL_DELIVERY_MODE: 'disabled' }))).toBeInstanceOf(DisabledEmailSender);
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
