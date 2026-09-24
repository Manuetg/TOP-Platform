import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailSender, EmailVerificationMessage, PasswordResetEmail } from '../domain/email-sender';

@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly config: ConfigService;
  constructor(config: ConfigService) {
    this.config = config;
  }
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM') ?? '';
    if (!host || !from) throw new Error('SMTP_HOST y SMTP_FROM son obligatorios en modo SMTP.');
    const transporter: Transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
    await transporter.sendMail({ from, to: email.to, subject: 'Tu código para restablecer la contraseña de TOP', text: `Usá este código para restablecer tu contraseña:\n\n${email.code ?? ''}\n\nEl código vence en 10 minutos.` });
  }
  async sendEmailVerification(email: EmailVerificationMessage): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM') ?? '';
    if (!host || !from) throw new Error('SMTP_HOST y SMTP_FROM son obligatorios en modo SMTP.');
    const transporter: Transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
    await transporter.sendMail({ from, to: email.to, subject: 'Verificá tu correo para usar TOP', text: `Confirmá tu correo para terminar de crear tu cuenta en TOP.\n\n${email.verificationUrl}\n\nEl enlace vence en 24 horas.` });
  }
}
