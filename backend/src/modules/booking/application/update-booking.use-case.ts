import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import { BookingNotDraftError, BookingNotFoundError } from './booking.errors';
import { BookingBase } from './booking.base';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../../contact/domain/contact.repository';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../../resource/resource.contract';
import { assertDateRange, bookingContactId, bookingCount, bookingDate, bookingNotes, bookingResourceIds, requireBookingPatch, requireBookingUuid } from './booking.validation';

export interface UpdateBookingInput { businessId: unknown; bookingId: unknown; contactId?: unknown; resourceIds?: unknown; checkInDate?: unknown; checkOutDate?: unknown; adults?: unknown; children?: unknown; notes?: unknown; }
@Injectable()
export class UpdateBookingUseCase extends BookingBase {
  constructor(@Inject(BUSINESS_REPOSITORY) businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) contacts: ContactRepository, @Inject(RESOURCE_REPOSITORY) resources: ResourceRepository, @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) { super(businesses, contacts, resources); }
  async execute(input: UpdateBookingInput): Promise<Booking> {
    const businessId = requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.');
    const bookingId = requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.');
    requireBookingPatch(input);
    const resourceIds = bookingResourceIds(input.resourceIds);
    const contactPatch = bookingContactId(input.contactId);
    const checkInPatch = bookingDate(input.checkInDate, 'La fecha de entrada');
    const checkOutPatch = bookingDate(input.checkOutDate, 'La fecha de salida');
    const adultsPatch = bookingCount(input.adults, 'La cantidad de adultos');
    const childrenPatch = bookingCount(input.children, 'La cantidad de niños');
    const notesPatch = bookingNotes(input.notes);
    await this.activeBusiness(businessId);
    const current = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!current) throw new BookingNotFoundError('La reserva no existe.');
    if (current.status !== BookingStatus.DRAFT) throw new BookingNotDraftError('Solo se puede modificar una reserva en borrador.');
    const contactId = contactPatch === undefined ? current.contactId : contactPatch;
    const checkInDate = checkInPatch === undefined ? current.checkInDate : checkInPatch;
    const checkOutDate = checkOutPatch === undefined ? current.checkOutDate : checkOutPatch;
    const adults = adultsPatch === undefined ? current.adults : adultsPatch;
    const children = childrenPatch === undefined ? current.children : childrenPatch;
    const notes = notesPatch === undefined ? current.notes : notesPatch;
    const finalResourceIds = resourceIds === undefined ? current.resourceIds : resourceIds;
    assertDateRange(checkInDate, checkOutDate);
    await this.validateContact(businessId, contactId);
    await this.validatePatchedResources(businessId, resourceIds);
    return this.bookings.update(Booking.create({ id: current.id, businessId: current.businessId, status: current.status, contactId, resourceIds: finalResourceIds, checkInDate, checkOutDate, adults, children, notes, createdAt: current.createdAt, updatedAt: current.updatedAt }), resourceIds !== undefined);
  }
}
