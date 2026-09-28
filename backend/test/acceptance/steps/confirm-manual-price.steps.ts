import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { PrismaService } from '../../../src/modules/business/business.contract';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const resourceId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '11111111-1111-4111-8111-111111111111';
const checkIn = '2026-10-10';
const checkOut = '2026-10-12';

Given('existe una reserva pendiente con una tarifa aplicable', async function (this: TopWorld): Promise<void> {
  const prisma = this.app!.get(PrismaService);
  await prisma.user.create({ data: { id: actorUserId, email: 'manual-acceptance@test.local' } });
  await prisma.business.create({ data: { id: businessId, name: 'Negocio de aceptación' } });
  const contact = await prisma.contact.create({ data: { businessId, name: 'Huésped de aceptación' } });
  await prisma.resource.create({ data: { id: resourceId, businessId, name: 'Habitación', internalCode: 'MANUAL-1', capacityMaximum: 2 } });
  const plan = await prisma.ratePlan.create({ data: { businessId, name: 'Tarifa aplicable', baseNightlyAmountMinor: 200000, resources: { create: { resourceId } } } });
  this.ratePlanId = plan.id;
  const booking = await prisma.booking.create({ data: { businessId, contactId: contact.id, status: 'PENDING', checkInDate: new Date(checkIn), checkOutDate: new Date(checkOut), adults: 2, children: 0, resources: { create: { resourceId } } } });
  this.bookingId = booking.id;
});

When('consulto los tarifarios de esa estadía', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app!.getHttpServer()).get(`/api/businesses/${businessId}/rate-plans`).query({ resourceId, checkIn, checkOut });
});

Then('el catálogo incluye la tarifa aplicable', function (this: TopWorld): void {
  assert.equal(this.response?.status, 200);
  assert.deepEqual(this.response?.body.map((plan: { id: string }) => plan.id), [this.ratePlanId]);
});

When('confirmo la reserva con precio manual sin referencia', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app!.getHttpServer())
    .post(`/api/businesses/${businessId}/bookings/${this.bookingId}/confirm`)
    .send({ pricing: [{ resourceId, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 450000, overrideReason: '  Acuerdo directo  ' }] });
});

Then('Booking, Snapshot y Timeline conservan el total manual sin plan', async function (this: TopWorld): Promise<void> {
  const prisma = this.app!.get(PrismaService);
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: this.bookingId } });
  const snapshot = await prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: this.bookingId } });
  const events = await prisma.bookingTimelineEvent.findMany({ where: { bookingId: this.bookingId, type: 'BOOKING_CONFIRMED' } });
  assert.equal(booking.status, 'CONFIRMED');
  assert.equal(snapshot.currency, 'PYG');
  assert.equal(snapshot.totalAmountMinor, 450000n);
  assert.deepEqual(snapshot.items, [{ resourceId, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, agreedAmountMinor: 450000, adjustmentAmountMinor: null, overrideReason: 'Acuerdo directo', nights: 2, breakdown: [] }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].actorUserId, actorUserId);
});
