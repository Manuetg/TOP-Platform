import { Injectable } from '@nestjs/common';
import type {
  AvailabilityOverbookingValidator,
  OverbookingValidationInput,
  OverbookingValidationResult,
} from '../availability.contract';
import { InvalidAvailabilityInputError } from './availability.errors';
import { CheckAvailabilityUseCase } from './check-availability.use-case';
import { assertAvailabilityUuid, parseAvailabilityDate } from './availability.validation';

@Injectable()
export class ValidateOverbookingUseCase
  implements AvailabilityOverbookingValidator
{
  constructor(private readonly availability: CheckAvailabilityUseCase) {}

  async validate(
    input: OverbookingValidationInput,
  ): Promise<OverbookingValidationResult> {
    this.validateInput(input);

    const results = await Promise.all(
      input.resourceIds.map((resourceId) =>
        this.availability.execute({
          businessId: input.businessId,
          resourceId,
          from: input.checkInDate,
          to: input.checkOutDate,
        }),
      ),
    );

    const conflicts = results
      .filter((result) => result.status === 'UNAVAILABLE')
      .map(({ resourceId, reasons }) => ({ resourceId, reasons }));

    return { valid: conflicts.length === 0, conflicts };
  }

  private validateInput(input: OverbookingValidationInput): void {
    assertAvailabilityUuid(input.businessId);

    if (!Array.isArray(input.resourceIds) || input.resourceIds.length === 0) {
      throw new InvalidAvailabilityInputError(
        'Debe informar al menos un recurso.',
      );
    }

    const resourceIds = new Set<string>();
    for (const resourceId of input.resourceIds) {
      if (typeof resourceId !== 'string') {
        throw new InvalidAvailabilityInputError(
          'El identificador no es válido.',
        );
      }
      assertAvailabilityUuid(resourceId);
      if (resourceIds.has(resourceId)) {
        throw new InvalidAvailabilityInputError(
          'Los recursos no pueden repetirse.',
        );
      }
      resourceIds.add(resourceId);
    }

    if (
      typeof input.checkInDate !== 'string' ||
      typeof input.checkOutDate !== 'string'
    ) {
      throw new InvalidAvailabilityInputError('Las fechas son inválidas.');
    }

    const checkIn = parseAvailabilityDate(
      input.checkInDate,
      'La fecha inicial',
    );
    const checkOut = parseAvailabilityDate(
      input.checkOutDate,
      'La fecha final',
    );
    if (checkOut <= checkIn) {
      throw new InvalidAvailabilityInputError(
        'La fecha final debe ser posterior a la fecha inicial.',
      );
    }
  }
}
