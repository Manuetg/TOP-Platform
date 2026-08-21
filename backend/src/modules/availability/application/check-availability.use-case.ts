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
import { deriveAvailability } from './availability.derivation';
import {
  assertAvailabilityUuid,
  parseAvailabilityDate,
} from './availability.validation';
import type { AvailabilityResult } from './availability.types';
import {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from './availability.errors';
import { AVAILABILITY_RULES_REPOSITORY, DEFAULT_AVAILABILITY_RULES, type AvailabilityRulesRepository } from '../domain/availability-rules.repository';

export type {
  AvailabilityReason,
  AvailabilityResult,
  AvailabilityStatus,
} from './availability.types';

export {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from './availability.errors';

@Injectable()
export class CheckAvailabilityUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resources: ResourceRepository,
    @Inject(BOOKING_AVAILABILITY_LOOKUP)
    private readonly bookings: BookingAvailabilityLookup,
    @Inject(BLOCK_AVAILABILITY_LOOKUP)
    private readonly blocks: BlockAvailabilityLookup,
    @Inject(AVAILABILITY_RULES_REPOSITORY)
    private readonly rules: AvailabilityRulesRepository,
  ) {}

  async execute(input: {
    businessId: string;
    resourceId: string;
    from: string;
    to: string;
  }): Promise<AvailabilityResult> {
    const range = this.range(input);
    await this.business(input.businessId);
    const resource = await this.resources.findByIdAndBusinessId(
      input.resourceId,
      input.businessId,
    );
    if (!resource) {
      throw new AvailabilityResourceNotFoundError('El recurso no existe.');
    }

    const shortCircuit = deriveAvailability(resource.status, false, false);
    if (shortCircuit.reasons.length > 0) {
      return this.out(input, shortCircuit);
    }

    const rules = await this.rules.findByBusinessId(input.businessId) ?? { businessId: input.businessId, ...DEFAULT_AVAILABILITY_RULES };
    const bookingFrom = this.addDays(range.from, -rules.bufferAfterDays);
    const bookingTo = this.addDays(range.to, rules.bufferBeforeDays);
    const [hasBookingConflict, hasBlockConflict] = await Promise.all([
      this.bookings.hasBlockingBooking(
        input.businessId,
        input.resourceId,
        bookingFrom,
        bookingTo,
        rules.pendingBlocksAvailability,
      ),
      this.blocks.hasBlockingBlock(
        input.businessId,
        input.resourceId,
        range.from,
        range.to,
      ),
    ]);
    return this.out(
      input,
      deriveAvailability(resource.status, hasBookingConflict, hasBlockConflict),
    );
  }

  private addDays(date: Date, days: number): Date { return new Date(date.getTime() + days * 24 * 60 * 60 * 1000); }

  private range(input: {
    businessId: string;
    resourceId: string;
    from: string;
    to: string;
  }): { from: Date; to: Date } {
    assertAvailabilityUuid(input.businessId);
    assertAvailabilityUuid(input.resourceId);
    const from = parseAvailabilityDate(input.from, 'La fecha inicial');
    const to = parseAvailabilityDate(input.to, 'La fecha final');
    if (to <= from) {
      throw new InvalidAvailabilityInputError(
        'La fecha final debe ser posterior a la fecha inicial.',
      );
    }
    return { from, to };
  }

  private async business(id: string): Promise<void> {
    const business = await this.businesses.findById(id);
    if (!business) {
      throw new AvailabilityBusinessNotFoundError('El negocio no existe.');
    }
    if (business.status !== BusinessStatus.ACTIVE) {
      throw new AvailabilityBusinessUnavailableError('El negocio no está activo.');
    }
  }

  private out(
    input: Pick<AvailabilityResult, 'resourceId' | 'from' | 'to'>,
    availability: Pick<AvailabilityResult, 'status' | 'reasons'>,
  ): AvailabilityResult {
    return {
      resourceId: input.resourceId,
      from: input.from,
      to: input.to,
      ...availability,
    };
  }
}
