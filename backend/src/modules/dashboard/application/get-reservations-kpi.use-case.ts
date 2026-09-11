import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  RESERVATIONS_PROJECTION_READER,
  type ReservationsProjectionReader,
  type ReservationsProjectionRow,
} from '../../booking/booking.contract';
import {
  BUSINESS_REPOSITORY,
  type BusinessRepository,
} from '../../business/business.contract';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAXIMUM_DAYS = 31;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const STATUSES = Object.values(BookingStatus);

export interface ReservationsKpi {
  total: number;
  byStatus: Record<BookingStatus, number>;
}

export class ReservationsKpiInputError extends Error {}
export class ReservationsKpiNotFoundError extends Error {}
export class ReservationsKpiInvariantError extends Error {}

@Injectable()
export class GetReservationsKpiUseCase {
  private readonly logger = new Logger(GetReservationsKpiUseCase.name);

  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(RESERVATIONS_PROJECTION_READER)
    private readonly reservations: ReservationsProjectionReader,
  ) {}

  async execute(input: {
    businessId: string;
    from: string;
    to: string;
  }): Promise<ReservationsKpi> {
    this.validateBusinessId(input.businessId);
    this.validatePeriod(input.from, input.to);
    const business = await this.businesses.findById(input.businessId);
    if (!business) {
      throw new ReservationsKpiNotFoundError('El negocio no existe.');
    }

    const rows = await this.reservations.read({
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      timeZone: business.timezone,
    });
    return this.toKpi(input, rows);
  }

  private validateBusinessId(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new ReservationsKpiInputError(
        'El identificador de negocio no es válido.',
      );
    }
  }

  private validatePeriod(from: string, to: string): void {
    const start = this.calendarDay(from, 'La fecha inicial');
    const end = this.calendarDay(to, 'La fecha final');
    if (end <= start) {
      throw new ReservationsKpiInputError(
        'La fecha final debe ser posterior a la fecha inicial.',
      );
    }
    if ((end - start) / DAY_IN_MILLISECONDS > MAXIMUM_DAYS) {
      throw new ReservationsKpiInputError('El rango no puede superar 31 días.');
    }
  }

  private calendarDay(value: string, label: string): number {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      throw new ReservationsKpiInputError(`${label} no es válida.`);
    }
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed) ||
      new Date(parsed).toISOString().slice(0, 10) !== value
    ) {
      throw new ReservationsKpiInputError(`${label} no es válida.`);
    }
    return parsed;
  }

  private toKpi(
    input: { businessId: string; from: string; to: string },
    rows: ReservationsProjectionRow[],
  ): ReservationsKpi {
    const byStatus = Object.fromEntries(
      STATUSES.map((status) => [status, 0]),
    ) as Record<BookingStatus, number>;
    const seen = new Set<BookingStatus>();

    for (const row of rows) {
      const knownStatus = STATUSES.includes(row.status);
      const validCount = Number.isSafeInteger(row.count) && row.count >= 0;
      if (!knownStatus || !validCount || seen.has(row.status)) {
        this.invariantViolation(input, rows);
      }
      seen.add(row.status);
      byStatus[row.status] = row.count;
    }

    const total = STATUSES.reduce((sum, status) => sum + byStatus[status], 0);
    if (!Number.isSafeInteger(total)) {
      this.invariantViolation(input, rows);
    }
    return { total, byStatus };
  }

  private invariantViolation(
    input: { businessId: string; from: string; to: string },
    rows: ReservationsProjectionRow[],
  ): never {
    this.logger.error({
      event: 'reservations_kpi_invariant_violation',
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      rows,
    });
    throw new ReservationsKpiInvariantError(
      'La proyección de reservas viola una invariante.',
    );
  }
}
