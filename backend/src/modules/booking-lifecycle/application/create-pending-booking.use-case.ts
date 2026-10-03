import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, BookingBase, BookingContactRequiredError, BookingDatesRequiredError, BookingNotFoundError, BookingResourcesRequiredError, type Booking, type BookingData, type BookingRepository, type CreateBookingInput, requireBookingUuid, assertDateRange, bookingContactId, bookingCount, bookingDate, bookingNotes, bookingResourceIds } from '../../booking/booking.contract';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../../resource/resource.contract';
import { CalculatePriceUseCase } from '../../pricing/application/calculate-price.use-case';
import { ApplyManualPriceOverrideUseCase } from '../../pricing/application/apply-manual-price-override.use-case';
import { PrepareManualPriceUseCase } from '../../pricing/application/prepare-manual-price.use-case';
import { PENDING_BOOKING_TRANSACTION, type PendingBookingTransaction } from '../pending-booking.contract';
import { PrepareBookingPricing } from './prepare-booking-pricing';

export interface CreatePendingBookingInput extends CreateBookingInput { pricing?: unknown; }

@Injectable()
export class CreatePendingBookingUseCase extends BookingBase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) businesses: BusinessRepository,
    @Inject(CONTACT_LOOKUP) contacts: ContactLookup,
    @Inject(RESOURCE_REPOSITORY) resources: ResourceRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(PENDING_BOOKING_TRANSACTION) private readonly pending: PendingBookingTransaction,
    private readonly calculatePrice: CalculatePriceUseCase,
    private readonly applyManualPriceOverride: ApplyManualPriceOverrideUseCase,
    private readonly prepareManualPrice: PrepareManualPriceUseCase,
  ) { super(businesses, contacts, resources); }

  async execute(input: CreatePendingBookingInput): Promise<Booking> {
    const data = this.completeDetails(input);
    assertDateRange(data.checkInDate, data.checkOutDate);
    await this.activeBusiness(data.businessId);
    await this.validateContact(data.businessId, data.contactId);
    const resources = await this.validateResources(data.businessId, data.resourceIds);
    this.validateCapacity(resources, data.adults, data.children);
    const pricing = new PrepareBookingPricing(this.calculatePrice, this.applyManualPriceOverride, this.prepareManualPrice);
    const bookingId = await this.pending.create({
      data,
      preparePricing: () => pricing.execute(data.businessId, { checkInDate: data.checkInDate, checkOutDate: data.checkOutDate }, data.resourceIds, input.pricing),
    });
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, data.businessId);
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    return booking;
  }

  private details(input: CreatePendingBookingInput): BookingData {
    return {
      businessId: requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.'),
      contactId: bookingContactId(input.contactId) ?? null,
      resourceIds: bookingResourceIds(input.resourceIds) ?? [],
      checkInDate: bookingDate(input.checkInDate, 'La fecha de entrada') ?? null,
      checkOutDate: bookingDate(input.checkOutDate, 'La fecha de salida') ?? null,
      adults: bookingCount(input.adults, 'La cantidad de adultos') ?? null,
      children: bookingCount(input.children, 'La cantidad de niños') ?? null,
      notes: bookingNotes(input.notes) ?? null,
      actorUserId: input.actorUserId === undefined ? null : requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.'),
    };
  }

  private completeDetails(input: CreatePendingBookingInput): BookingData & { contactId: string; checkInDate: Date; checkOutDate: Date } {
    const data = this.details(input);
    if (!data.contactId) throw new BookingContactRequiredError('La reserva requiere un contacto responsable.');
    if (data.resourceIds.length !== 1) throw new BookingResourcesRequiredError('La reserva requiere exactamente un recurso.');
    if (!data.checkInDate || !data.checkOutDate) throw new BookingDatesRequiredError('La reserva requiere fechas completas.');
    return { ...data, contactId: data.contactId, checkInDate: data.checkInDate, checkOutDate: data.checkOutDate };
  }
}
