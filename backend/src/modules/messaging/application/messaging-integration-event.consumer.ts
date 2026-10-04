import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../../booking/booking.contract';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../../resource/resource.contract';
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshot, type PricingSnapshotRepository } from '../../pricing/pricing.contract';
import type { IntegrationEvent } from '../../../shared/integration-events/integration-event';
import type { IntegrationEventConsumer } from '../../../shared/integration-events/integration-event.consumer';
import { IntegrationEventConsumerRegistry } from '../../../shared/integration-events/integration-event-consumer-registry';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import { MessagingBookingNotFoundError, MessagingBusinessNotFoundError, MessagingContactNotFoundError, MessagingPricingSnapshotNotFoundError, MessagingRecipientNotFoundError, MessagingResourceNotFoundError } from './messaging.errors';
import type { Booking } from '../../booking/domain/booking.entity';
import type { Business } from '../../business/domain/business.entity';

@Injectable()
export class MessagingIntegrationEventConsumer implements IntegrationEventConsumer, OnModuleInit {
  readonly eventTypes = ['BOOKING_CONFIRMED'] as const;

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly snapshots: PricingSnapshotRepository,
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
    const booking = await this.booking(bookingId, event.businessId);
    const business = await this.business(event.businessId);
    const recipient = await this.recipient(booking, event.businessId);
    const resources = await this.resourceNames(booking, event.businessId);
    const snapshot = await this.snapshot(booking.id, event.businessId);

    await this.messages.createPending({
      businessId: event.businessId,
      integrationEventId: event.eventId,
      channel: MessagingChannel.WHATSAPP,
      recipient,
      messageType: OutboundMessageType.BOOKING_CONFIRMATION,
      payload: {
        bookingId,
        status: 'CONFIRMED',
        text: confirmationText({ businessName: business.name, booking, resourceNames: resources, totalAmountMinor: snapshot.totalAmountMinor, currency: snapshot.currency }),
      },
    });
  }

  private bookingId(event: IntegrationEvent): string {
    const bookingId = event.payload.bookingId;
    if (typeof bookingId !== 'string' || bookingId.length === 0) throw new MessagingBookingNotFoundError('El evento no contiene un bookingId válido.');
    return bookingId;
  }

  private async booking(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!booking) throw new MessagingBookingNotFoundError('La reserva del evento no existe.');
    return booking;
  }

  private async business(businessId: string): Promise<Business> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new MessagingBusinessNotFoundError('El negocio del evento no existe.');
    return business;
  }

  private async recipient(booking: Booking, businessId: string): Promise<string> {
    if (!booking.contactId) throw new MessagingContactNotFoundError('La reserva no tiene un contacto asociado.');
    const contact = await this.contacts.findByIdAndBusinessId(booking.contactId, businessId);
    if (!contact || contact.businessId !== businessId) throw new MessagingContactNotFoundError('El contacto del evento no existe.');
    const recipient = contact.whatsapp ?? contact.phone;
    if (!recipient) throw new MessagingRecipientNotFoundError('El contacto no tiene un destinatario de WhatsApp.');
    return recipient;
  }

  private async resourceNames(booking: Booking, businessId: string): Promise<string[]> {
    return Promise.all(booking.resourceIds.map((resourceId) => this.resourceName(resourceId, businessId)));
  }

  private async resourceName(resourceId: string, businessId: string): Promise<string> {
    const resource = await this.resources.findByIdAndBusinessId(resourceId, businessId);
    if (!resource || resource.businessId !== businessId) throw new MessagingResourceNotFoundError('El recurso de la reserva no existe.');
    return resource.name;
  }

  private async snapshot(bookingId: string, businessId: string): Promise<PricingSnapshot> {
    const snapshot = await this.snapshots.findByBookingId(bookingId);
    if (!snapshot || snapshot.businessId !== businessId) throw new MessagingPricingSnapshotNotFoundError('La reserva confirmada no tiene un PricingSnapshot válido.');
    return snapshot;
  }
}

function confirmationText(input: {
  businessName: string;
  booking: Booking;
  resourceNames: string[];
  totalAmountMinor: number;
  currency: string;
}): string {
  const lines = [
    `Tu reserva en ${input.businessName} fue confirmada.`,
    '',
    input.resourceNames.join(', '),
  ];
  if (input.booking.checkInDate && input.booking.checkOutDate) {
    lines.push(`${formatDate(input.booking.checkInDate)} → ${formatDate(input.booking.checkOutDate)}`);
  }
  const guests = guestCount(input.booking.adults, input.booking.children);
  if (guests !== null) lines.push(`${guests} huésped${guests === 1 ? '' : 'es'}`);
  lines.push('', `Total confirmado: ${formatAmount(input.totalAmountMinor, input.currency)}.`);
  return lines.join('\n');
}

function guestCount(adults: number | null, children: number | null): number | null {
  if (adults === null || children === null) return null;
  return adults + children;
}

function formatDate(value: Date): string {
  const iso = value.toISOString().slice(0, 10);
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatAmount(amountMinor: number, currency: string): string {
  const formatted = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(amountMinor);
  return `${formatted} ${currency === 'PYG' ? 'Gs' : currency}`;
}
