import { createHmac } from 'node:crypto';
import { MetaWhatsAppWebhookController } from './meta-whatsapp-webhook.controller';
import { MetaWhatsAppWebhookParser } from '../infrastructure/meta-whatsapp-webhook.parser';
import { MetaWhatsAppWebhookSecurity } from '../infrastructure/meta-whatsapp-webhook.signature';

describe('MetaWhatsAppWebhookController', () => {
  it('valida firma sobre rawBody y procesa el body ya parseado', async () => {
    const body = Buffer.from('{"entry":[]}');
    const handler = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new MetaWhatsAppWebhookController(new MetaWhatsAppWebhookSecurity({ appSecret: 'secret', verifyToken: 'token' }), new MetaWhatsAppWebhookParser(), handler);
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;

    await expect(controller.receive(signature, { rawBody: body, body: { object: 'whatsapp_business_account', entry: [] } })).resolves.toEqual({ received: true });
    expect(handler.execute).toHaveBeenCalledWith([]);
  });

  it('rechaza firma inválida antes de ejecutar el handler', async () => {
    const handler = { execute: jest.fn() };
    const controller = new MetaWhatsAppWebhookController(new MetaWhatsAppWebhookSecurity({ appSecret: 'secret', verifyToken: 'token' }), new MetaWhatsAppWebhookParser(), handler);

    await expect(controller.receive('sha256=invalid', { rawBody: Buffer.from('{}'), body: {} })).rejects.toThrow();
    expect(handler.execute).not.toHaveBeenCalled();
  });
});
