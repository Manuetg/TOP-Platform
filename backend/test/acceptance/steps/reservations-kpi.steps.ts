import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { BookingStatus } from '../../../src/modules/booking/booking.contract';
import {
  GetReservationsKpiUseCase,
  ReservationsKpiInvariantError,
} from '../../../src/modules/dashboard/application/get-reservations-kpi.use-case';
import { BusinessStatus } from '../../../src/modules/business/business.contract';
import { setBusinessStatus } from '../support/business-repository.fake';
import {
  reservationsProjectionLastInput,
  setReservationsProjection,
} from '../support/reservations-projection-reader.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';

Given('Reservations no tiene Bookings creadas para el negocio', function (): void {
  setReservationsProjection(businessId, []);
});

Given(
  'Reservations tiene {int} {word} para el negocio',
  function (count: number, status: BookingStatus): void {
    setReservationsProjection(businessId, [{ status, count }]);
  },
);

Given(
  'otro negocio tiene {int} {word} en Reservations',
  function (count: number, status: BookingStatus): void {
    setReservationsProjection(otherBusinessId, [{ status, count }]);
  },
);

Given(
  'Reservations tiene 1 DRAFT, 2 PENDING, 3 CONFIRMED, 4 IN_PROGRESS, 5 COMPLETED, 6 CANCELLED y 7 NO_SHOW',
  function (): void {
    setReservationsProjection(businessId, [
      { status: BookingStatus.DRAFT, count: 1 },
      { status: BookingStatus.PENDING, count: 2 },
      { status: BookingStatus.CONFIRMED, count: 3 },
      { status: BookingStatus.IN_PROGRESS, count: 4 },
      { status: BookingStatus.COMPLETED, count: 5 },
      { status: BookingStatus.CANCELLED, count: 6 },
      { status: BookingStatus.NO_SHOW, count: 7 },
    ]);
  },
);

Given('una Booking creada en el período ahora está CANCELLED', function (): void {
  setReservationsProjection(businessId, [
    { status: BookingStatus.CANCELLED, count: 1 },
  ]);
});

Given('una Booking creada en el período tiene múltiples Resources', function (): void {
  setReservationsProjection(businessId, [
    { status: BookingStatus.CONFIRMED, count: 1 },
  ]);
});

Given('una Booking creada en el período tiene estadía futura', function (): void {
  setReservationsProjection(businessId, [
    { status: BookingStatus.PENDING, count: 1 },
  ]);
});

Given('el negocio de Reservations está archivado', function (): void {
  setBusinessStatus(businessId, BusinessStatus.ARCHIVED);
});

Given('Reservations contiene un estado persistido desconocido', function (): void {
  setReservationsProjection(businessId, [
    { status: 'UNKNOWN' as BookingStatus, count: 1 },
  ]);
});

When(
  'calculo el KPI interno de Reservations para el período aprobado',
  async function (this: TopWorld): Promise<void> {
    assert.ok(this.app);
    try {
      this.reservationsResult = await this.app
        .get(GetReservationsKpiUseCase)
        .execute({
          businessId,
          from: '2026-09-01',
          to: '2026-09-10',
        });
    } catch (error: unknown) {
      this.reservationsError = error as Error;
    }
  },
);

Then(
  'Reservations devuelve total {int} y todos los estados en cero',
  function (this: TopWorld, total: number): void {
    assert.equal(this.reservationsResult?.total, total);
    assert.deepEqual(this.reservationsResult?.byStatus, {
      DRAFT: 0,
      PENDING: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    });
  },
);

Then(
  'Reservations devuelve total {int} y la distribución aprobada',
  function (this: TopWorld, total: number): void {
    assert.equal(this.reservationsResult?.total, total);
    assert.deepEqual(this.reservationsResult?.byStatus, {
      DRAFT: 1,
      PENDING: 2,
      CONFIRMED: 3,
      IN_PROGRESS: 4,
      COMPLETED: 5,
      CANCELLED: 6,
      NO_SHOW: 7,
    });
  },
);

Then(
  'Reservations devuelve {int} CANCELLED y los demás estados en cero',
  function (this: TopWorld, count: number): void {
    assert.deepEqual(this.reservationsResult, {
      total: count,
      byStatus: {
        DRAFT: 0,
        PENDING: 0,
        CONFIRMED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: count,
        NO_SHOW: 0,
      },
    });
  },
);

Then(
  'Reservations devuelve {int} CANCELLED y {int} DRAFT',
  function (this: TopWorld, cancelled: number, draft: number): void {
    assert.equal(this.reservationsResult?.byStatus.CANCELLED, cancelled);
    assert.equal(this.reservationsResult?.byStatus.DRAFT, draft);
  },
);

Then('Reservations devuelve total {int}', function (this: TopWorld, total: number): void {
  assert.equal(this.reservationsResult?.total, total);
});

Then(
  'Reservations consulta con la timezone America\\/Asuncion',
  function (): void {
    assert.equal(reservationsProjectionLastInput()?.timeZone, 'America/Asuncion');
  },
);

Then('Reservations reporta una invariante interna', function (this: TopWorld): void {
  assert.ok(this.reservationsError instanceof ReservationsKpiInvariantError);
});
