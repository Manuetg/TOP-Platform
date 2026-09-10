import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OCCUPANCY_PROJECTION_READER,
  type OccupancyProjectionReader,
} from '../../availability/availability.contract';
import {
  BUSINESS_REPOSITORY,
  type BusinessRepository,
} from '../../business/business.contract';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAXIMUM_DAYS = 31;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface OccupancyKpi {
  occupiedResourceNights: number;
  sellableResourceNights: number;
  occupancyRateBasisPoints: number | null;
}

export class OccupancyKpiInputError extends Error {}
export class OccupancyKpiNotFoundError extends Error {}
export class OccupancyKpiInvariantError extends Error {}

@Injectable()
export class GetOccupancyKpiUseCase {
  private readonly logger = new Logger(GetOccupancyKpiUseCase.name);

  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(OCCUPANCY_PROJECTION_READER)
    private readonly occupancy: OccupancyProjectionReader,
  ) {}

  async execute(input: { businessId: string; from: string; to: string }): Promise<OccupancyKpi> {
    this.validateBusinessId(input.businessId);
    this.validatePeriod(input.from, input.to);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new OccupancyKpiNotFoundError('El negocio no existe.');

    const projection = await this.occupancy.read({
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      timeZone: business.timezone,
    });
    this.assertProjection(input, projection);
    return {
      ...projection,
      occupancyRateBasisPoints: projection.sellableResourceNights === 0
        ? null
        : Math.round(
          projection.occupiedResourceNights * 10_000 /
          projection.sellableResourceNights,
        ),
    };
  }

  private validateBusinessId(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new OccupancyKpiInputError('El identificador de negocio no es válido.');
    }
  }

  private validatePeriod(from: string, to: string): void {
    const start = this.calendarDay(from, 'La fecha inicial');
    const end = this.calendarDay(to, 'La fecha final');
    if (end <= start) {
      throw new OccupancyKpiInputError('La fecha final debe ser posterior a la fecha inicial.');
    }
    if ((end - start) / DAY_IN_MILLISECONDS > MAXIMUM_DAYS) {
      throw new OccupancyKpiInputError('El rango no puede superar 31 días.');
    }
  }

  private calendarDay(value: string, label: string): number {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      throw new OccupancyKpiInputError(`${label} no es válida.`);
    }
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
      throw new OccupancyKpiInputError(`${label} no es válida.`);
    }
    return parsed;
  }

  private assertProjection(
    input: { businessId: string; from: string; to: string },
    projection: { occupiedResourceNights: number; sellableResourceNights: number },
  ): void {
    const validCounts = Number.isSafeInteger(projection.occupiedResourceNights) &&
      Number.isSafeInteger(projection.sellableResourceNights) &&
      projection.occupiedResourceNights >= 0 && projection.sellableResourceNights >= 0;
    if (validCounts && projection.occupiedResourceNights <= projection.sellableResourceNights) return;
    this.logger.error({
      event: 'occupancy_kpi_invariant_violation',
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      ...projection,
    });
    throw new OccupancyKpiInvariantError('La proyección de ocupación viola una invariante.');
  }
}
