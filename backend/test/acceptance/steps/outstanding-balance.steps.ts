import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request, { type Test } from 'supertest';
import { Booking } from '../../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../../src/modules/booking/domain/booking-status.enum';
import { addBookingFake, bookingRepositoryFake } from '../support/booking-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const balanceEndpoint = (world: TopWorld, owner = businessId) =>
  `/api/businesses/${owner}/bookings/${world.bookingId}/outstanding-balance`;
const planEndpoint = (world: TopWorld) =>
  `/api/businesses/${businessId}/bookings/${world.bookingId}/payment-plan`;

function authorize(world: TopWorld, operation: Test): Test {
  return world.accessToken
    ? operation.set('Authorization', `Bearer ${world.accessToken}`)
    : operation;
}

Given(
  'el Booking tiene un Payment Plan con cuotas {string} en fechas {string}',
  async function (this: TopWorld, amounts: string, dates: string): Promise<void> {
    const amountValues = amounts.split(',').map(Number);
    const dateValues = dates.split(',').map((value) => value === 'null' ? null : value);
    const response = await authorize(
      this,
      request(this.app?.getHttpServer())
        .post(planEndpoint(this))
        .send({ installments: amountValues.map((amountMinor, index) => ({ amountMinor, dueDate: dateValues[index] })) }),
    );
    assert.equal(response.status, 201);
  },
);

Given(
  'el Booking financiero queda en estado {string}',
  async function (this: TopWorld, status: string): Promise<void> {
    const current = await bookingRepositoryFake.findByIdAndBusinessId(this.bookingId ?? '', businessId);
    assert.ok(current);
    addBookingFake(Booking.create({
      id: current.id,
      businessId,
      status: status as BookingStatus,
      contactId: current.contactId,
      resourceIds: current.resourceIds,
      checkInDate: current.checkInDate,
      checkOutDate: current.checkOutDate,
      adults: current.adults,
      children: current.children,
      notes: current.notes,
      createdAt: current.createdAt,
      updatedAt: new Date(),
    }));
  },
);

When(
  'consulto el Outstanding Balance de la reserva',
  async function (this: TopWorld): Promise<void> {
    this.response = await authorize(
      this,
      request(this.app?.getHttpServer()).get(balanceEndpoint(this)),
    );
  },
);

When(
  'consulto el Outstanding Balance de la reserva desde otro negocio',
  async function (this: TopWorld): Promise<void> {
    this.response = await authorize(
      this,
      request(this.app?.getHttpServer()).get(balanceEndpoint(this, otherBusinessId)),
    );
  },
);

Then(
  'el saldo informa total {int}, pagado {int}, pendiente {int} y estado {string}',
  function (this: TopWorld, total: number, paid: number, outstanding: number, status: string): void {
    assert.equal(this.response?.status, 200);
    assert.equal(this.response?.body.totalAmountMinor, total);
    assert.equal(this.response?.body.paidAmountMinor, paid);
    assert.equal(this.response?.body.outstandingAmountMinor, outstanding);
    assert.equal(this.response?.body.financialStatus, status);
  },
);

Then(
  'el saldo no inventa vencimientos',
  function (this: TopWorld): void {
    assert.equal(this.response?.body.overdueAmountMinor, 0);
    assert.equal(this.response?.body.nextDueDate, null);
    assert.equal(this.response?.body.nextDueAmountMinor, null);
  },
);

Then(
  'el saldo informa vencido {int} y próximo vencimiento {string} por {int}',
  function (this: TopWorld, overdue: number, dueDate: string, dueAmount: number): void {
    assert.equal(this.response?.body.overdueAmountMinor, overdue);
    assert.equal(this.response?.body.nextDueDate, dueDate);
    assert.equal(this.response?.body.nextDueAmountMinor, dueAmount);
  },
);

Then(
  'la consulta de Outstanding Balance responde {int}',
  function (this: TopWorld, status: number): void {
    assert.equal(this.response?.status, status);
  },
);
