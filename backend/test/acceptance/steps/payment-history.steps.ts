import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request, { type Test } from 'supertest';
import { BusinessStatus } from '../../../src/modules/business/domain/business-status.enum';
import { PaymentMethod, PaymentStatus, type Payment } from '../../../src/modules/payment/domain/payment';
import { setBusinessStatus } from '../support/business-repository.fake';
import { addPaymentFake } from '../support/payment-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const endpoint = (world: TopWorld) => `/api/businesses/${businessId}/bookings/${world.bookingId}/payments`;

function authorize(world: TopWorld, operation: Test): Test {
  return world.accessToken ? operation.set('Authorization', `Bearer ${world.accessToken}`) : operation;
}

function payment(world: TopWorld, amountMinor: number, index: number, paidAt: Date, createdAt: Date): Payment {
  const id = `81000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    id,
    businessId,
    bookingId: world.bookingId ?? '',
    amountMinor,
    currency: 'PYG',
    method: PaymentMethod.CASH,
    reference: null,
    note: null,
    paidAt,
    createdAt,
    recordedByUserId: '11111111-1111-4111-8111-111111111111',
    status: PaymentStatus.RECORDED,
    idempotencyKey: `history-${id}`,
    requestFingerprint: `fingerprint-${id}`,
  };
}

Given('existen Payments históricos con importes {string}', function (this: TopWorld, values: string): void {
  values.split(',').map(Number).forEach((amount, index) => addPaymentFake(payment(
    this,
    amount,
    index + 1,
    new Date(`2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`),
    new Date(`2026-09-${String(index + 1).padStart(2, '0')}T11:00:00.000Z`),
  )));
});

Given('existen Payments con el mismo paidAt y distintos createdAt', function (this: TopWorld): void {
  [10, 20, 30].forEach((amount, index) => addPaymentFake(payment(
    this,
    amount,
    index + 1,
    new Date('2026-09-01T10:00:00.000Z'),
    new Date(`2026-09-01T11:00:0${index}.000Z`),
  )));
});

Given('existe un Payment registrado posteriormente con paidAt histórico', function (this: TopWorld): void {
  addPaymentFake(payment(this, 10, 1, new Date('2020-01-01T10:00:00.000Z'), new Date('2026-09-09T10:00:00.000Z')));
});

Given('el Business del historial está archivado', function (): void {
  setBusinessStatus(businessId, BusinessStatus.ARCHIVED);
});

When('consulto el historial de Payments', async function (this: TopWorld): Promise<void> {
  this.response = await authorize(this, request(this.app?.getHttpServer()).get(endpoint(this)));
});

When('consulto el historial de Payments con límite {int}', async function (this: TopWorld, limit: number): Promise<void> {
  this.response = await authorize(this, request(this.app?.getHttpServer()).get(`${endpoint(this)}?limit=${limit}`));
});

When('consulto la siguiente página del historial con límite {int}', async function (this: TopWorld, limit: number): Promise<void> {
  const cursor = this.response?.body.pageInfo.nextCursor as string;
  this.response = await authorize(this, request(this.app?.getHttpServer()).get(`${endpoint(this)}?limit=${limit}&cursor=${encodeURIComponent(cursor)}`));
});

Then('el historial contiene {int} Payments', function (this: TopWorld, count: number): void {
  assert.equal(this.response?.status, 200);
  assert.equal(this.response?.body.items.length, count);
});

Then('el historial informa importes {string}', function (this: TopWorld, values: string): void {
  assert.equal(this.response?.status, 200);
  assert.deepEqual(this.response?.body.items.map((item: {amountMinor:number}) => item.amountMinor), values.split(',').filter(Boolean).map(Number));
});

Then('el historial tiene página siguiente', function (this: TopWorld): void {
  assert.equal(this.response?.body.pageInfo.hasNextPage, true);
  assert.equal(typeof this.response?.body.pageInfo.nextCursor, 'string');
});

Then('el historial no tiene página siguiente', function (this: TopWorld): void {
  assert.deepEqual(this.response?.body.pageInfo, { nextCursor: null, hasNextPage: false });
});

Then('el historial expone únicamente el contrato público', function (this: TopWorld): void {
  const item = this.response?.body.items[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(item).sort(), [
    'amountMinor', 'bookingId', 'createdAt', 'currency', 'id', 'method', 'note',
    'paidAt', 'recordedByUserId', 'reference', 'status',
  ]);
});

Then('el historial conserva paidAt {string}', function (this: TopWorld, paidAt: string): void {
  assert.equal(this.response?.body.items[0].paidAt, paidAt);
});

Then('la consulta del historial responde {int}', function (this: TopWorld, status: number): void {
  assert.equal(this.response?.status, status);
});
