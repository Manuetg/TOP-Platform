import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';
import {
  BLOCK_AVAILABILITY_LOOKUP,
  type BlockAvailabilityLookup,
} from '../../block/block.contract';
import {
  BOOKING_AVAILABILITY_LOOKUP,
  type BookingAvailabilityLookup,
} from '../../booking/booking.contract';
import {
  RESOURCE_REPOSITORY,
  type ResourceRepository,
} from '../../resource/resource.contract';
import type { Resource } from '../../resource/domain/resource.entity';
import {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from './availability.errors';
import { deriveAvailability } from './availability.derivation';
import {
  assertAvailabilityUuid,
  formatAvailabilityDate,
  parseAvailabilityDate,
} from './availability.validation';
import type {
  AvailabilityReason,
  AvailabilityStatus,
} from './availability.types';

const MAXIMUM_CALENDAR_DAYS = 31;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface AvailabilityCalendarDay {
  date: string;
  status: AvailabilityStatus;
  reasons: AvailabilityReason[];
}

export interface AvailabilityCalendarResource {
  resourceId: string;
  days: AvailabilityCalendarDay[];
}

export interface AvailabilityCalendarResult {
  from: string;
  to: string;
  resources: AvailabilityCalendarResource[];
}

@Injectable()
export class ListAvailabilityCalendarUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resources: ResourceRepository,
    @Inject(BOOKING_AVAILABILITY_LOOKUP)
    private readonly bookings: BookingAvailabilityLookup,
    @Inject(BLOCK_AVAILABILITY_LOOKUP)
    private readonly blocks: BlockAvailabilityLookup,
  ) {}

  async execute(input: {
    businessId: string;
    from: string;
    to: string;
    resourceId?: string;
  }): Promise<AvailabilityCalendarResult> {
    const range = this.validateRange(input);
    await this.assertBusinessIsAvailable(input.businessId);

    const resources = input.resourceId
      ? await this.findResource(input.resourceId, input.businessId)
      : await this.resources.listByBusinessId(input.businessId);

    const [bookingConflicts, blockConflicts] = await Promise.all([
      this.bookings.listBlockingBookings(
        input.businessId,
        range.from,
        range.to,
      ),
      this.blocks.listBlockingBlocks(input.businessId, range.from, range.to),
    ]);

    return {
      from: input.from,
      to: input.to,
      resources: resources.map((resource) => ({
        resourceId: resource.id,
        days: this.days(
          range.from,
          range.to,
          resource.id,
          resource.status,
          bookingConflicts,
          blockConflicts,
        ),
      })),
    };
  }

  private validateRange(input: {
    businessId: string;
    from: string;
    to: string;
    resourceId?: string;
  }): { from: Date; to: Date } {
    assertAvailabilityUuid(input.businessId);
    if (input.resourceId !== undefined) {
      assertAvailabilityUuid(input.resourceId);
    }

    const from = parseAvailabilityDate(input.from, 'La fecha inicial');
    const to = parseAvailabilityDate(input.to, 'La fecha final');
    if (to <= from) {
      throw new InvalidAvailabilityInputError(
        'La fecha final debe ser posterior a la fecha inicial.',
      );
    }
    if ((to.getTime() - from.getTime()) / DAY_IN_MILLISECONDS > MAXIMUM_CALENDAR_DAYS) {
      throw new InvalidAvailabilityInputError(
        'El rango no puede superar 31 días.',
      );
    }
    return { from, to };
  }

  private async assertBusinessIsAvailable(businessId: string): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) {
      throw new AvailabilityBusinessNotFoundError('El negocio no existe.');
    }
    if (business.status !== BusinessStatus.ACTIVE) {
      throw new AvailabilityBusinessUnavailableError('El negocio no está activo.');
    }
  }

  private async findResource(
    resourceId: string,
    businessId: string,
  ): Promise<Resource[]> {
    const resource = await this.resources.findByIdAndBusinessId(
      resourceId,
      businessId,
    );
    if (!resource) {
      throw new AvailabilityResourceNotFoundError('El recurso no existe.');
    }
    return [resource];
  }

  private days(
    from: Date,
    to: Date,
    resourceId: string,
    resourceStatus: Parameters<typeof deriveAvailability>[0],
    bookingConflicts: Awaited<
      ReturnType<BookingAvailabilityLookup['listBlockingBookings']>
    >,
    blockConflicts: Awaited<
      ReturnType<BlockAvailabilityLookup['listBlockingBlocks']>
    >,
  ): AvailabilityCalendarDay[] {
    const days: AvailabilityCalendarDay[] = [];

    for (
      let start = new Date(from);
      start < to;
      start = new Date(start.getTime() + DAY_IN_MILLISECONDS)
    ) {
      const end = new Date(start.getTime() + DAY_IN_MILLISECONDS);
      const hasBookingConflict = bookingConflicts.some(
        (conflict) =>
          conflict.resourceId === resourceId &&
          conflict.checkInDate < end &&
          conflict.checkOutDate > start,
      );
      const hasBlockConflict = blockConflicts.some(
        (conflict) =>
          conflict.resourceId === resourceId &&
          conflict.startsAt < end &&
          conflict.endsAt > start,
      );
      const availability = deriveAvailability(
        resourceStatus,
        hasBookingConflict,
        hasBlockConflict,
      );
      days.push({
        date: formatAvailabilityDate(start),
        ...availability,
      });
    }

    return days;
  }
}
