import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import { Booking } from '../domain/booking.entity';
import { assertDateRange, bookingContactId, bookingCount, bookingDate, bookingNotes, bookingResourceIds, requireBookingUuid } from './booking.validation';
import { BookingBase } from './booking.base';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../../resource/resource.contract';

export interface CreateBookingInput { businessId: unknown; contactId?: unknown; resourceIds?: unknown; checkInDate?: unknown; checkOutDate?: unknown; adults?: unknown; children?: unknown; notes?: unknown; }
@Injectable()
export class CreateBookingUseCase extends BookingBase {
  constructor(@Inject(BUSINESS_REPOSITORY) businesses: BusinessRepository, @Inject(CONTACT_LOOKUP) contacts: ContactLookup, @Inject(RESOURCE_REPOSITORY) resources: ResourceRepository, @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) { super(businesses, contacts, resources); }
  async execute(input: CreateBookingInput): Promise<Booking> {
    const businessId = requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.');
    const contactId = bookingContactId(input.contactId) ?? null;
    const resourceIds = bookingResourceIds(input.resourceIds) ?? [];
    const checkInDate = bookingDate(input.checkInDate, 'La fecha de entrada') ?? null;
    const checkOutDate = bookingDate(input.checkOutDate, 'La fecha de salida') ?? null;
    const adults = bookingCount(input.adults, 'La cantidad de adultos') ?? null;
    const children = bookingCount(input.children, 'La cantidad de niños') ?? null;
    const notes = bookingNotes(input.notes) ?? null;
    assertDateRange(checkInDate, checkOutDate);
    await this.activeBusiness(businessId);
    await this.validateContact(businessId, contactId);
    await this.validateResources(businessId, resourceIds);
    return this.bookings.create({ businessId, contactId, resourceIds, checkInDate, checkOutDate, adults, children, notes });
  }
}
