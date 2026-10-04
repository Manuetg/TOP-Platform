import { Inject, Injectable } from '@nestjs/common';
import { RESOURCE_REPOSITORY, ResourceStatus, type ResourceRepository } from '../../resource/resource.contract';
import type { AvailabilityQuery, AvailabilityQueryInput, AvailableResourceResult } from '../availability.contract';
import { InvalidAvailabilityInputError } from './availability.errors';
import { ListAvailabilityCalendarUseCase } from './list-availability-calendar.use-case';

@Injectable()
export class ListAvailableResourcesUseCase implements AvailabilityQuery {
  constructor(
    private readonly calendar: ListAvailabilityCalendarUseCase,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
  ) {}

  async findAvailableResources(input: AvailabilityQueryInput): Promise<AvailableResourceResult[]> {
    this.validateGuests(input.guests);
    const [resources, calendar] = await Promise.all([
      this.resources.listByBusinessId(input.businessId),
      this.calendar.execute({ businessId: input.businessId, from: input.from, to: input.to }),
    ]);
    const availableById = new Map(
      calendar.resources
        .filter((resource) => resource.days.length > 0 && resource.days.every((day) => day.status === 'AVAILABLE'))
        .map((resource) => [resource.resourceId, true]),
    );

    return resources
      .filter((resource) => resource.status === ResourceStatus.ACTIVE)
      .filter((resource) => resource.capacityMaximum >= input.guests)
      .filter((resource) => availableById.has(resource.id))
      .map((resource) => ({ resourceId: resource.id, name: resource.name }));
  }

  private validateGuests(guests: number): void {
    if (!Number.isInteger(guests) || guests <= 0) {
      throw new InvalidAvailabilityInputError('La cantidad de huéspedes debe ser un entero positivo.');
    }
  }
}
