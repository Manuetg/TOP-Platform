import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MetaWhatsAppWebhookConfiguration } from '../../../config/environment';

export class MetaWhatsAppWebhookSecurityError extends Error {}

export const META_WHATSAPP_WEBHOOK_CONFIGURATION = Symbol('META_WHATSAPP_WEBHOOK_CONFIGURATION');

export class MetaWhatsAppWebhookSecurity {
  constructor(private readonly configuration: MetaWhatsAppWebhookConfiguration) {}

  verifyChallenge(input: { mode: unknown; verifyToken: unknown; challenge: unknown }): string {
    if (input.mode !== 'subscribe' || input.verifyToken !== this.configuration.verifyToken || typeof input.challenge !== 'string') {
      throw new MetaWhatsAppWebhookSecurityError('La verificación del webhook no es válida.');
    }
    return input.challenge;
  }

  verifySignature(rawBody: Buffer | undefined, signature: unknown): void {
    if (!rawBody || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') throw new MetaWhatsAppWebhookSecurityError('La firma del webhook no es válida.');
    const match = /^sha256=([0-9a-f]{64})$/i.exec(signature);
    if (!match) throw new MetaWhatsAppWebhookSecurityError('La firma del webhook no es válida.');
    const expected = createHmac('sha256', this.configuration.appSecret).update(rawBody).digest();
    const received = Buffer.from(match[1], 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new MetaWhatsAppWebhookSecurityError('La firma del webhook no es válida.');
  }
}
