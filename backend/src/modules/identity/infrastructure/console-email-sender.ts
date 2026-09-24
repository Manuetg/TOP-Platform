import { Injectable, Logger } from '@nestjs/common';
import type { EmailSender, EmailVerificationMessage, PasswordResetEmail } from '../domain/email-sender';

@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);
  sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    this.logger.log(`Password reset instructions queued for ${email.to}${email.code ? ` (code ${email.code})` : ''}`);
    return Promise.resolve();
  }
  sendEmailVerification(email: EmailVerificationMessage): Promise<void> {
    this.logger.log(`Email verification queued for ${email.to}: ${email.verificationUrl}`);
    return Promise.resolve();
  }
}
