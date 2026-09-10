import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import {
  GetOccupancyKpiUseCase,
  OccupancyKpiInvariantError,
} from '../../../src/modules/dashboard/application/get-occupancy-kpi.use-case';
import { setOccupancyProjection } from '../support/occupancy-projection-reader.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';

Given(
  'la ocupación interna tiene {int} noches ocupadas y {int} noches vendibles',
  function (occupied: number, sellable: number): void {
    setOccupancyProjection({ occupiedResourceNights: occupied, sellableResourceNights: sellable });
  },
);

When(
  'calculo el KPI interno de Occupancy para el período aprobado',
  async function (this: TopWorld): Promise<void> {
    assert.ok(this.app);
    try {
      this.occupancyResult = await this.app.get(GetOccupancyKpiUseCase).execute({
        businessId,
        from: '2026-09-01',
        to: '2026-09-04',
      });
    } catch (error: unknown) {
      this.occupancyError = error as Error;
    }
  },
);

Then(
  'Occupancy devuelve {int} ocupadas, {int} vendibles y {int} basis points',
  function (this: TopWorld, occupied: number, sellable: number, basisPoints: number): void {
    assert.deepEqual(this.occupancyResult, {
      occupiedResourceNights: occupied,
      sellableResourceNights: sellable,
      occupancyRateBasisPoints: basisPoints,
    });
  },
);

Then(
  'Occupancy devuelve denominador cero y rate nulo',
  function (this: TopWorld): void {
    assert.deepEqual(this.occupancyResult, {
      occupiedResourceNights: 0,
      sellableResourceNights: 0,
      occupancyRateBasisPoints: null,
    });
  },
);

Then(
  'Occupancy reporta una invariante interna inconsistente',
  function (this: TopWorld): void {
    assert.ok(this.occupancyError instanceof OccupancyKpiInvariantError);
  },
);
