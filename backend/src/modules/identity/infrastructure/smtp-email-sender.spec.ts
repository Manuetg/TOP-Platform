import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { SmtpEmailSender } from './smtp-email-sender';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('SmtpEmailSender', () => {
  const sendMail = jest.fn().mockResolvedValue({});
  const createTransport = jest.mocked(nodemailer.createTransport);
  const complete = {
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.top.test',
    SMTP_FROM: 'no-reply@top.test',
    SMTP_PORT: 587,
  };
  const config = (overrides: Record<string, unknown> = {}): ConfigService => {
    const values = { ...complete, ...overrides };
    const service = new ConfigService(values);
    jest.spyOn(service, 'get').mockImplementation((key: string) => values[key as keyof typeof values]);
    return service;
  };

  beforeEach(() => {
    sendMail.mockClear();
    createTransport.mockReset().mockReturnValue({ sendMail } as never);
  });

  it('exige STARTTLS con certificados válidos en producción para puerto 587', () => {
    new SmtpEmailSender(config());
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.top.test', port: 587, secure: false, requireTLS: true,
      tls: { rejectUnauthorized: true },
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('usa TLS directo en puerto 465', () => {
    new SmtpEmailSender(config({ SMTP_PORT: '465' }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 465, secure: true, requireTLS: false, tls: { rejectUnauthorized: true },
    }));
  });

  it('mantiene SMTP local sin requerir STARTTLS', () => {
    new SmtpEmailSender(config({ NODE_ENV: 'test', SMTP_PORT: 1025 }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 1025, secure: false, requireTLS: false,
    }));
  });

  it('acepta credenciales únicamente como pareja completa', () => {
    new SmtpEmailSender(config({ SMTP_USER: 'smtp-user', SMTP_PASSWORD: 'smtp-pass' }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: { user: 'smtp-user', pass: 'smtp-pass' },
    }));
  });

  it.each([
    { SMTP_HOST: undefined }, { SMTP_HOST: '' }, { SMTP_HOST: 'https://smtp.example.com' },
    { SMTP_FROM: undefined }, { SMTP_FROM: '' }, { SMTP_FROM: 'invalid' },
    { SMTP_PORT: '' }, { SMTP_PORT: 'abc' }, { SMTP_PORT: 0 }, { SMTP_PORT: 65536 },
    { SMTP_PORT: 1.5 }, { SMTP_USER: 'user' }, { SMTP_PASSWORD: 'password' },
    { SMTP_USER: '', SMTP_PASSWORD: 'password' },
  ])('rechaza configuración SMTP inválida antes de crear transporte: %j', (overrides) => {
    expect(() => new SmtpEmailSender(config(overrides))).toThrow(/SMTP_/);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('preserva los mensajes de recuperación y verificación con un único transporte', async () => {
    const sender = new SmtpEmailSender(config());
    await sender.sendPasswordReset({ to: 'user@example.com', code: '123456', expiresAt: new Date() });
    await sender.sendEmailVerification({ to: 'user@example.com', verificationUrl: 'https://app.example.com/verify-email?token=synthetic-token', expiresAt: new Date() });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: 'no-reply@top.test', to: 'user@example.com',
      subject: 'Tu código para restablecer la contraseña de TOP', text: expect.stringContaining('123456') as unknown,
    }));
    expect(sendMail).toHaveBeenNthCalledWith(2, expect.objectContaining({
      subject: 'Verificá tu correo para usar TOP',
      text: expect.stringContaining('https://app.example.com/verify-email?token=synthetic-token') as unknown,
    }));
  });
});
