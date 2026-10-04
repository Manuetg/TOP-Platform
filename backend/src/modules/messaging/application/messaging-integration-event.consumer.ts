import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../../booking/booking.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import type { IntegrationEvent } from '../../../shared/integration-events/integration-event';
import type { IntegrationEventConsumer } from '../../../shared/integration-events/integration-event.consumer';
import { IntegrationEventConsumerRegistry } from '../../../shared/integration-events/integration-event-consumer-registry';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import { MessagingBookingNotFoundError, MessagingContactNotFoundError, MessagingRecipientNotFoundError } from './messaging.errors';

@Injectable()
export class MessagingIntegrationEventConsumer implements IntegrationEventConsumer, OnModuleInit {
  readonly eventTypes = ['BOOKING_CONFIRMED'] as const;

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: OutboundMessageRepository,
    private readonly registry: IntegrationEventConsumerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return this.eventTypes.includes(eventType as (typeof this.eventTypes)[number]);
  }

  async handle(event: IntegrationEvent): Promise<void> {
    if (!this.supports(event.eventType)) return;
    const bookingId = this.bookingId(event);
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, event.businessId);
    if (!booking) throw new MessagingBookingNotFoundError('La reserva del evento no existe.');
    if (!booking.contactId) throw new MessagingContactNotFoundError('La reserva no tiene un contacto asociado.');

    const contact = await this.contacts.findByIdAndBusinessId(booking.contactId, event.businessId);
    if (!contact || contact.businessId !== event.businessId) throw new MessagingContactNotFoundError('El contacto del evento no existe.');
    const recipient = contact.whatsapp ?? contact.phone;
    if (!recipient) throw new MessagingRecipientNotFoundError('El contacto no tiene un destinatario de WhatsApp.');

    await this.messages.createPending({
      businessId: event.businessId,
      integrationEventId: event.eventId,
      channel: MessagingChannel.WHATSAPP,
      recipient,
      messageType: OutboundMessageType.BOOKING_CONFIRMATION,
      payload: { bookingId, status: 'CONFIRMED' },
    });
  }

  private bookingId(event: IntegrationEvent): string {
    const bookingId = event.payload.bookingId;
    if (typeof bookingId !== 'string' || bookingId.length === 0) throw new MessagingBookingNotFoundError('El evento no contiene un bookingId válido.');
    return bookingId;
  }
}
