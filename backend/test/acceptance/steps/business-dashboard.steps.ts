import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { BookingStatus } from '../../../src/modules/booking/booking.contract';
import { BusinessStatus } from '../../../src/modules/business/business.contract';
import { setBusinessStatus } from '../support/business-repository.fake';
import { setOccupancyProjection } from '../support/occupancy-projection-reader.fake';
import { setReservationsProjection } from '../support/reservations-projection-reader.fake';
import { setRevenueProjection } from '../support/revenue-projection-reader.fake';
import { TopWorld } from '../support/world';

const businessA = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const businessB = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const period = 'from=2026-09-01&to=2026-09-10';

Given('Dashboard tiene ocupación, ingresos y reservas para el período', function (): void {
  setOccupancyProjection({
    occupiedResourceNights: 3,
    sellableResourceNights: 4,
  });
  setRevenueProjection(businessA, {
    amounts: [{ currency: 'PYG', amountMinor: 750_000 }],
  });
  setReservationsProjection(businessA, [
    { status: BookingStatus.CONFIRMED, count: 2 },
    { status: BookingStatus.CANCELLED, count: 1 },
  ]);
});

Given('Dashboard no tiene actividad para el período', function (): void {
  setOccupancyProjection({
    occupiedResourceNights: 0,
    sellableResourceNights: 0,
  });
  setRevenueProjection(businessA, { amounts: [] });
  setReservationsProjection(businessA, []);
});

Given('el Business de Dashboard está archivado', function (): void {
  setBusinessStatus(businessA, BusinessStatus.ARCHIVED);
});

When(
  'consulto el Dashboard de Business A para el período aprobado',
  async function (this: TopWorld): Promise<void> {
    this.response = await request(this.app?.getHttpServer())
      .get(`/api/businesses/${businessA}/dashboard?${period}`);
  },
);

When(
  'consulto el Dashboard de Business A con un período mayor a 31 días',
  async function (this: TopWorld): Promise<void> {
    this.response = await request(this.app?.getHttpServer())
      .get(`/api/businesses/${businessA}/dashboard?from=2026-01-01&to=2026-02-02`);
  },
);

When(
  'consulto el Dashboard autorizado de Business A',
  async function (this: TopWorld): Promise<void> {
    this.response = await request(this.app?.getHttpServer())
      .get(`/api/businesses/${businessA}/dashboard?${period}`)
      .set('Authorization', `Bearer ${this.accessToken}`);
  },
);

When(
  'consulto el Dashboard autorizado de Business B',
  async function (this: TopWorld): Promise<void> {
    this.response = await request(this.app?.getHttpServer())
      .get(`/api/businesses/${businessB}/dashboard?${period}`)
      .set('Authorization', `Bearer ${this.accessToken}`);
  },
);

Then('Dashboard devuelve las tres métricas completas', function (this: TopWorld): void {
  assert.deepEqual(this.response?.body, {
    occupancy: {
      occupiedResourceNights: 3,
      sellableResourceNights: 4,
      occupancyRateBasisPoints: 7500,
    },
    revenue: { currency: 'PYG', amountMinor: 750_000 },
    reservations: {
      total: 3,
      byStatus: {
        DRAFT: 0,
        PENDING: 0,
        CONFIRMED: 2,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 1,
        NO_SHOW: 0,
      },
    },
  });
});

Then(
  'Dashboard devuelve ocupación nula, ingresos cero y reservas en cero',
  function (this: TopWorld): void {
    assert.equal(this.response?.body.occupancy.occupancyRateBasisPoints, null);
    assert.deepEqual(this.response?.body.revenue, {
      currency: 'PYG',
      amountMinor: 0,
    });
    assert.equal(this.response?.body.reservations.total, 0);
    assert.deepEqual(Object.values(this.response?.body.reservations.byStatus), [
      0, 0, 0, 0, 0, 0, 0,
    ]);
  },
);
