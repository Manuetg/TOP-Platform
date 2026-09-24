export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface PasswordResetEmail {
  to: string;
  resetUrl?: string;
  expiresAt: Date;
  code?: string;
}

export interface EmailVerificationMessage {
  to: string;
  verificationUrl: string;
  expiresAt: Date;
}

export interface EmailSender {
  sendPasswordReset(email: PasswordResetEmail & { code?: string }): Promise<void>;
  sendEmailVerification?(email: EmailVerificationMessage): Promise<void>;
}
