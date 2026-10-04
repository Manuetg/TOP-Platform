import { createHmac } from 'node:crypto';
import { MetaWhatsAppWebhookSecurity, MetaWhatsAppWebhookSecurityError } from './meta-whatsapp-webhook.signature';

const security = new MetaWhatsAppWebhookSecurity({ appSecret: 'app-secret', verifyToken: 'verify-token' });

describe('MetaWhatsAppWebhookSecurity', () => {
  it('devuelve el challenge exacto con modo y token correctos', () => {
    expect(security.verifyChallenge({ mode: 'subscribe', verifyToken: 'verify-token', challenge: 'challenge-value' })).toBe('challenge-value');
  });

  it.each([
    { mode: 'other', verifyToken: 'verify-token', challenge: 'challenge' },
    { mode: 'subscribe', verifyToken: 'wrong', challenge: 'challenge' },
    { mode: 'subscribe', verifyToken: 'verify-token', challenge: 123 },
  ])('rechaza challenge inválido %#', (input) => {
    expect(() => security.verifyChallenge(input)).toThrow(MetaWhatsAppWebhookSecurityError);
  });

  it('valida HMAC sobre los bytes originales', () => {
    const body = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;

    expect(() => security.verifySignature(body, signature)).not.toThrow();
    expect(() => security.verifySignature(Buffer.from('{ "entry": [] }'), signature)).toThrow(MetaWhatsAppWebhookSecurityError);
  });

  it.each([undefined, '', 'sha256=not-hex', 'sha1=00', `sha256=${'a'.repeat(62)}`, `sha256=${'a'.repeat(66)}`])('rechaza firma ausente o mal formada: %s', (signature) => {
    expect(() => security.verifySignature(Buffer.from('{}'), signature)).toThrow(MetaWhatsAppWebhookSecurityError);
  });

  it('no arroja una excepción interna con longitud de firma incorrecta', () => {
    expect(() => security.verifySignature(Buffer.from('{}'), 'sha256=00')).toThrow(MetaWhatsAppWebhookSecurityError);
  });
});
