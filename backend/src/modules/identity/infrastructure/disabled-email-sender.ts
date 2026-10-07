import type { EmailSender } from '../domain/email-sender';
import { EmailFeatureDisabledError } from '../domain/email-feature-disabled.error';

export class DisabledEmailSender implements EmailSender {
  sendPasswordReset(): Promise<void> {
    return Promise.reject(new EmailFeatureDisabledError());
  }

  sendEmailVerification(): Promise<void> {
    return Promise.reject(new EmailFeatureDisabledError());
  }
}
