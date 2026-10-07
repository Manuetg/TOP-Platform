import { Logger } from '@nestjs/common';
import type { EmailSender } from '../domain/email-sender';
import { EmailFeatureDisabledError } from '../domain/email-feature-disabled.error';
import { DisabledEmailSender } from './disabled-email-sender';

describe('DisabledEmailSender', () => {
  it('rechaza ambos envíos sin loguear ni incluir destinatarios, códigos o URLs', async () => {
    const logger = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const errorLogger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sender: EmailSender = new DisabledEmailSender();
    const marker = 'synthetic-private-marker';
    try {
      for (const send of [
        () => sender.sendPasswordReset({ to: `${marker}@top.test`, code: marker, resetUrl: `http://host/${marker}`, expiresAt: new Date() }),
        () => sender.sendEmailVerification!({ to: `${marker}@top.test`, verificationUrl: `http://host/${marker}`, expiresAt: new Date() }),
      ]) {
        try { await send(); throw new Error('Envío deshabilitado aceptado.'); }
        catch (error: unknown) {
          expect(error).toBeInstanceOf(EmailFeatureDisabledError);
          expect(String(error)).not.toContain(marker);
          expect((error as Error).stack).not.toContain(marker);
        }
      }
      expect(logger).not.toHaveBeenCalled();
      expect(errorLogger).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
      errorLogger.mockRestore();
    }
  });
});
