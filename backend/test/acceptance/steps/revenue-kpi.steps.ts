import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import {
  GetRevenueKpiUseCase,
  RevenueKpiInvariantError,
} from '../../../src/modules/dashboard/application/get-revenue-kpi.use-case';
import { BusinessStatus } from '../../../src/modules/business/business.contract';
import { setBusinessStatus } from '../support/business-repository.fake';
import { setRevenueProjection } from '../support/revenue-projection-reader.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';

Given(
  'Revenue no tiene cobros registrados para el negocio',
  function (): void {
    setRevenueProjection(businessId, { amounts: [] });
  },
);

Given(
  'Revenue tiene {int} PYG registrados para el negocio',
  function (amountMinor: number): void {
    setRevenueProjection(businessId, {
      amounts: [{ currency: 'PYG', amountMinor }],
    });
  },
);

Given(
  'otro negocio tiene {int} PYG registrados en Revenue',
  function (amountMinor: number): void {
    setRevenueProjection(otherBusinessId, {
      amounts: [{ currency: 'PYG', amountMinor }],
    });
  },
);

Given('el negocio de Revenue está archivado', function (): void {
  setBusinessStatus(businessId, BusinessStatus.ARCHIVED);
});

Given(
  'Revenue tiene {int} PYG y {int} USD en el mismo negocio',
  function (pyg: number, usd: number): void {
    setRevenueProjection(businessId, {
      amounts: [
        { currency: 'PYG', amountMinor: pyg },
        { currency: 'USD', amountMinor: usd },
      ],
    });
  },
);

When(
  'calculo el KPI interno de Revenue para el período aprobado',
  async function (this: TopWorld): Promise<void> {
    assert.ok(this.app);
    try {
      this.revenueResult = await this.app.get(GetRevenueKpiUseCase).execute({
        businessId,
        from: '2026-09-01',
        to: '2026-09-10',
      });
    } catch (error: unknown) {
      this.revenueError = error as Error;
    }
  },
);

Then(
  'Revenue devuelve {int} PYG',
  function (this: TopWorld, amountMinor: number): void {
    assert.deepEqual(this.revenueResult, { currency: 'PYG', amountMinor });
  },
);

Then(
  'Revenue reporta una invariante financiera interna',
  function (this: TopWorld): void {
    assert.ok(this.revenueError instanceof RevenueKpiInvariantError);
  },
);
