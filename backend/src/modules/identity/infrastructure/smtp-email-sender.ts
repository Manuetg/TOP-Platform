import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { readSmtpConfiguration } from '../../../config/environment';
import type { EmailSender, EmailVerificationMessage, PasswordResetEmail } from '../domain/email-sender';

@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly from: string;
  constructor(config: ConfigService) {
    const { from, ...transport } = readSmtpConfiguration(config);
    this.from = from;
    const options: SMTPTransport.Options = {
      ...transport,
      tls: { rejectUnauthorized: true },
    };
    this.transporter = nodemailer.createTransport(options);
  }
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: email.to, subject: 'Tu código para restablecer la contraseña de TOP', text: `Usá este código para restablecer tu contraseña:\n\n${email.code ?? ''}\n\nEl código vence en 10 minutos.` });
  }
  async sendEmailVerification(email: EmailVerificationMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: email.to, subject: 'Verificá tu correo para usar TOP', text: `Confirmá tu correo para terminar de crear tu cuenta en TOP.\n\n${email.verificationUrl}\n\nEl enlace vence en 24 horas.` });
  }
}
