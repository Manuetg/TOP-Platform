import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  type BusinessRepository,
} from '../../business/business.contract';
import {
  REVENUE_PROJECTION_READER,
  type RevenueProjection,
  type RevenueProjectionReader,
} from '../../payment/payment.contract';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAXIMUM_DAYS = 31;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface RevenueKpi {
  currency: string;
  amountMinor: number;
}

export class RevenueKpiInputError extends Error {}
export class RevenueKpiNotFoundError extends Error {}
export class RevenueKpiInvariantError extends Error {}

@Injectable()
export class GetRevenueKpiUseCase {
  private readonly logger = new Logger(GetRevenueKpiUseCase.name);

  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(REVENUE_PROJECTION_READER)
    private readonly revenue: RevenueProjectionReader,
  ) {}

  async execute(input: {
    businessId: string;
    from: string;
    to: string;
  }): Promise<RevenueKpi> {
    this.validateBusinessId(input.businessId);
    this.validatePeriod(input.from, input.to);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new RevenueKpiNotFoundError('El negocio no existe.');

    const projection = await this.revenue.read({
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      timeZone: business.timezone,
    });
    this.assertProjection(input, business.currency, projection);
    return projection.amounts[0] ?? {
      currency: business.currency,
      amountMinor: 0,
    };
  }

  private validateBusinessId(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new RevenueKpiInputError(
        'El identificador de negocio no es válido.',
      );
    }
  }

  private validatePeriod(from: string, to: string): void {
    const start = this.calendarDay(from, 'La fecha inicial');
    const end = this.calendarDay(to, 'La fecha final');
    if (end <= start) {
      throw new RevenueKpiInputError(
        'La fecha final debe ser posterior a la fecha inicial.',
      );
    }
    if ((end - start) / DAY_IN_MILLISECONDS > MAXIMUM_DAYS) {
      throw new RevenueKpiInputError('El rango no puede superar 31 días.');
    }
  }

  private calendarDay(value: string, label: string): number {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      throw new RevenueKpiInputError(`${label} no es válida.`);
    }
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed) ||
      new Date(parsed).toISOString().slice(0, 10) !== value
    ) {
      throw new RevenueKpiInputError(`${label} no es válida.`);
    }
    return parsed;
  }

  private assertProjection(
    input: { businessId: string; from: string; to: string },
    expectedCurrency: string,
    projection: RevenueProjection,
  ): void {
    const amount = projection.amounts[0];
    const valid = projection.amounts.length <= 1 &&
      (amount === undefined || (
        amount.currency === expectedCurrency &&
        Number.isSafeInteger(amount.amountMinor) &&
        amount.amountMinor >= 0
      ));
    if (valid) return;
    this.logger.error({
      event: 'revenue_kpi_invariant_violation',
      businessId: input.businessId,
      from: input.from,
      to: input.to,
      expectedCurrency,
      amounts: projection.amounts,
    });
    throw new RevenueKpiInvariantError(
      'La proyección de ingresos viola una invariante.',
    );
  }
}
