import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';
import type { MessagingWebhookEvent } from '../application/messaging-webhook.contract';

export class MetaWhatsAppWebhookParser {
  parse(payload: unknown): MessagingWebhookEvent[] {
    const root = record(payload);
    if (!root || root.object !== 'whatsapp_business_account') return [];
    return array(root.entry).flatMap((entry) => this.entryEvents(entry));
  }

  private entryEvents(value: unknown): MessagingWebhookEvent[] {
    const entry = record(value);
    return entry ? array(entry.changes).flatMap((change) => this.changeEvents(change)) : [];
  }

  private changeEvents(value: unknown): MessagingWebhookEvent[] {
    const change = record(value);
    const webhookValue = record(change?.value);
    const providerPhoneNumberId = text(record(webhookValue?.metadata)?.phone_number_id);
    if (!webhookValue || !providerPhoneNumberId) return [];
    return [
      ...array(webhookValue.messages).map((message) => this.inboundText(message, providerPhoneNumberId)).filter(isEvent),
      ...array(webhookValue.statuses).map((status) => this.deliveryStatus(status, providerPhoneNumberId)).filter(isEvent),
    ];
  }

  private inboundText(value: unknown, providerPhoneNumberId: string): MessagingWebhookEvent | null {
    const message = record(value);
    if (!message || message.type !== 'text') return null;
    const textValue = record(message?.text);
    const parsed = { providerMessageId: text(message.id), sender: text(message.from), body: text(textValue?.body), occurredAt: epochDate(message.timestamp) };
    if (!Object.values(parsed).every(Boolean)) return null;
    return { kind: 'INBOUND_TEXT', provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId, providerMessageId: parsed.providerMessageId!, sender: parsed.sender!, text: parsed.body!, occurredAt: parsed.occurredAt! };
  }

  private deliveryStatus(value: unknown, providerPhoneNumberId: string): MessagingWebhookEvent | null {
    const status = record(value);
    const providerMessageId = text(status?.id);
    const occurredAt = epochDate(status?.timestamp);
    const mappedStatus = typeof status?.status === 'string' ? statusMap[status.status] : undefined;
    if (!providerMessageId || !occurredAt || !mappedStatus) return null;
    return { kind: 'DELIVERY_STATUS', provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId, providerMessageId, status: mappedStatus, occurredAt, lastError: mappedStatus === OutboundMessageStatus.FAILED ? safeError(status?.errors) : null };
  }
}

type DeliveryStatus = OutboundMessageStatus.SENT | OutboundMessageStatus.DELIVERED | OutboundMessageStatus.READ | OutboundMessageStatus.FAILED;

const statusMap: Record<string, DeliveryStatus> = {
  sent: OutboundMessageStatus.SENT,
  delivered: OutboundMessageStatus.DELIVERED,
  read: OutboundMessageStatus.READ,
  failed: OutboundMessageStatus.FAILED,
};

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function isEvent(value: MessagingWebhookEvent | null): value is MessagingWebhookEvent { return value !== null; }
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function epochDate(value: unknown): Date | null {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}
function safeError(value: unknown): string | null {
  const first = array(value).map(record).find((item): item is Record<string, unknown> => Boolean(item));
  if (!first) return null;
  const parts = [numberText(first.code), text(first.title), text(first.message), text(record(first.error_data)?.details)].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(': ').replace(/[\r\n]+/g, ' ').slice(0, 2_000) : null;
}
function numberText(value: unknown): string | null { return typeof value === 'number' && Number.isFinite(value) ? String(value) : null; }
