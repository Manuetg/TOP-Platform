import { Inject, Injectable } from '@nestjs/common';
import { CONTACT_MESSAGING_LOOKUP, type ContactMessagingLookup } from '../../contact/contact.contract';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import type { InboundMessageJsonValue } from '../domain/inbound-message.entity';
import { RECEIVE_INBOUND_MESSAGE_TRANSACTION, type InboundMessageEnvelope, type ReceiveInboundMessageInput, type ReceiveInboundMessageResult, type ReceiveInboundMessageTransaction } from './receive-inbound-message.contract';
import { InvalidInboundMessageInputError } from './receive-inbound-message.errors';

@Injectable()
export class ReceiveInboundMessageUseCase {
  constructor(
    @Inject(CONTACT_MESSAGING_LOOKUP) private readonly contacts: ContactMessagingLookup,
    @Inject(RECEIVE_INBOUND_MESSAGE_TRANSACTION) private readonly transaction: ReceiveInboundMessageTransaction,
  ) {}

  async execute(input: ReceiveInboundMessageInput): Promise<ReceiveInboundMessageResult> {
    const envelope = validateInput(input);
    const contact = await this.contacts.findByMessagingAddressAndBusinessId(envelope.sender, envelope.businessId);
    return this.transaction.receive({ envelope, contactId: contact?.id ?? null });
  }
}

function validateInput(input: ReceiveInboundMessageInput): InboundMessageEnvelope {
  const businessId = uuid(input.businessId, 'El identificador del negocio no es válido.');
  if (input.channel !== MessagingChannel.WHATSAPP) throw new InvalidInboundMessageInputError('El canal de mensajería no está soportado.');
  if (input.messageType !== InboundMessageType.TEXT) throw new InvalidInboundMessageInputError('El tipo de mensaje entrante no está soportado.');
  const providerMessageId = text(input.providerMessageId, 'El identificador del mensaje del provider no es válido.', 255);
  const sender = e164(input.sender);
  const payload = jsonObject(input.payload);
  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) throw new InvalidInboundMessageInputError('El payload TEXT debe contener texto.');
  const receivedAt = input.receivedAt === undefined ? new Date() : date(input.receivedAt);
  return { businessId, channel: MessagingChannel.WHATSAPP, providerMessageId, sender, messageType: InboundMessageType.TEXT, payload, receivedAt };
}

function uuid(value: unknown, message: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidInboundMessageInputError(message);
  return value;
}

function text(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maxLength) throw new InvalidInboundMessageInputError(message);
  return value;
}

function e164(value: unknown): string {
  if (typeof value !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value)) throw new InvalidInboundMessageInputError('El remitente debe ser un teléfono E.164 válido.');
  return value;
}

function date(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new InvalidInboundMessageInputError('La fecha de recepción no es válida.');
  return value;
}

function jsonObject(value: unknown): { [key: string]: InboundMessageJsonValue } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !jsonValue(value)) throw new InvalidInboundMessageInputError('El payload entrante no es JSON válido.');
  return value as { [key: string]: InboundMessageJsonValue };
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(jsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(jsonValue);
}
