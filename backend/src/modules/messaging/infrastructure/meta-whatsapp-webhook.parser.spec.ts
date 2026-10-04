import { MetaWhatsAppWebhookParser } from './meta-whatsapp-webhook.parser';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';

describe('MetaWhatsAppWebhookParser', () => {
  it('mapea múltiples entries, changes, mensajes TEXT y statuses', () => {
    const events = new MetaWhatsAppWebhookParser().parse(payload({
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: 'phone-a' }, messages: [{ id: 'wamid-1', from: '595981234567', timestamp: '1791028800', type: 'text', text: { body: 'Hola' } }, { id: 'image-1', from: '595981234567', timestamp: '1791028800', type: 'image' }], statuses: [{ id: 'wamid-out-1', status: 'delivered', timestamp: '1791028801' }] } }] },
        { changes: [{ value: { metadata: { phone_number_id: 'phone-b' }, messages: [{ id: 'wamid-2', from: '595982345678', timestamp: '1791028802', type: 'text', text: { body: 'Segundo' } }], statuses: [{ id: 'wamid-out-2', status: 'failed', timestamp: '1791028803', errors: [{ code: 131026, title: 'Undeliverable', message: 'safe failure' }] }] } }] },
      ],
    }));

    expect(events).toEqual([
      expect.objectContaining({ kind: 'INBOUND_TEXT', provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'phone-a', providerMessageId: 'wamid-1', sender: '595981234567', text: 'Hola' }),
      expect.objectContaining({ kind: 'DELIVERY_STATUS', providerPhoneNumberId: 'phone-a', providerMessageId: 'wamid-out-1', status: OutboundMessageStatus.DELIVERED }),
      expect.objectContaining({ kind: 'INBOUND_TEXT', providerPhoneNumberId: 'phone-b', providerMessageId: 'wamid-2', text: 'Segundo' }),
      expect.objectContaining({ kind: 'DELIVERY_STATUS', providerPhoneNumberId: 'phone-b', providerMessageId: 'wamid-out-2', status: OutboundMessageStatus.FAILED, lastError: '131026: Undeliverable: safe failure' }),
    ]);
    expect(events[0]).toMatchObject({ occurredAt: new Date('2026-10-03T12:00:00.000Z') });
  });

  it('ignora tipos no soportados, estructuras desconocidas y metadata sin phone id', () => {
    expect(new MetaWhatsAppWebhookParser().parse({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: {}, messages: [{ type: 'audio' }] } }] }] })).toEqual([]);
    expect(new MetaWhatsAppWebhookParser().parse({ object: 'other', entry: [] })).toEqual([]);
    expect(new MetaWhatsAppWebhookParser().parse(null)).toEqual([]);
  });
});

function payload(overrides: Record<string, unknown>): unknown {
  return { object: 'whatsapp_business_account', entry: [], ...overrides };
}
