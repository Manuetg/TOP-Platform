import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request, { type Test } from 'supertest';
import { BookingStatus } from '../../../src/modules/booking/domain/booking-status.enum';
import { bookingRepositoryFake } from '../support/booking-repository.fake';
import { applicationCount, snapshots } from '../support/payment-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const endpoint = (world: TopWorld) => `/api/businesses/${businessId}/bookings/${world.bookingId}/payment-plan`;
const paymentEndpoint = (world: TopWorld) => `/api/businesses/${businessId}/bookings/${world.bookingId}/payments`;
const parseAmounts = (value: string) => value.split(',').map((item) => Number(item));
const planBody = (value: string) => ({ installments: parseAmounts(value).map((amountMinor) => ({ amountMinor, dueDate: null })) });

function withAuthorization(world: TopWorld, operation: Test): Test {
  return world.accessToken ? operation.set('Authorization', `Bearer ${world.accessToken}`) : operation;
}

async function createPlan(world: TopWorld, amounts: string): Promise<void> {
  world.response = await withAuthorization(
    world,
    request(world.app?.getHttpServer()).post(endpoint(world)).send(planBody(amounts)),
  );
}

async function recordPayment(world: TopWorld, amountMinor: number, key: string): Promise<void> {
  world.response = await withAuthorization(
    world,
    request(world.app?.getHttpServer())
      .post(paymentEndpoint(world))
      .set('Idempotency-Key', key)
      .send({ amountMinor, method: 'CASH', paidAt: '2026-09-01T12:00:00.000Z' }),
  );
}

When('se crea un Payment Plan con cuotas {string}', async function (this: TopWorld, amounts: string): Promise<void> {
  await createPlan(this, amounts);
});

Given('existe un Payment Plan con cuotas {string}', async function (this: TopWorld, amounts: string): Promise<void> {
  await createPlan(this, amounts);
  assert.equal(this.response?.status, 201);
});

When('se intenta crear un Payment Plan con cuotas {string}', async function (this: TopWorld, amounts: string): Promise<void> {
  await createPlan(this, amounts);
});

When('se registra para el plan un Payment de {int} con clave {string}', async function (this: TopWorld, amountMinor: number, key: string): Promise<void> {
  await recordPayment(this, amountMinor, key);
  assert.equal(this.response?.status, 201);
});

When('se registran Payments de {int} y {int} para el plan', async function (this: TopWorld, first: number, second: number): Promise<void> {
  await recordPayment(this, first, 'first-application');
  assert.equal(this.response?.status, 201);
  await recordPayment(this, second, 'second-application');
  assert.equal(this.response?.status, 201);
});

When('se intenta reemplazar el Payment Plan con cuotas {string}', async function (this: TopWorld, amounts: string): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).put(endpoint(this)).send(planBody(amounts));
});

Then('el Payment Plan tiene montos {string} y aplicados {string}', async function (this: TopWorld, amounts: string, applied: string): Promise<void> {
  const response = await request(this.app?.getHttpServer()).get(endpoint(this));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.installments.map((item: { amountMinor: number }) => item.amountMinor), parseAmounts(amounts));
  assert.deepEqual(response.body.installments.map((item: { appliedAmountMinor: number }) => item.appliedAmountMinor), parseAmounts(applied));
});

Then('existe {int} PaymentApplication', function (expected: number): void {
  assert.equal(applicationCount(), expected);
});

Then('existen {int} PaymentApplications', function (expected: number): void {
  assert.equal(applicationCount(), expected);
});

Then('el Booking del plan permanece CONFIRMED', async function (this: TopWorld): Promise<void> {
  const booking = await bookingRepositoryFake.findByIdAndBusinessId(this.bookingId ?? '', businessId);
  assert.equal(booking?.status, BookingStatus.CONFIRMED);
});

Then('el PricingSnapshot del plan permanece sin cambios', function (this: TopWorld): void {
  const snapshot = snapshots.get(this.bookingId ?? '');
  assert.equal(snapshot?.totalAmountMinor, 100);
  assert.equal(snapshot?.currency, 'PYG');
});

Then('la operación de Payment Plan es rechazada con {int}', function (this: TopWorld, status: number): void {
  assert.equal(this.response?.status, status);
});
