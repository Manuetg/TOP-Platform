import { Given, When } from '@cucumber/cucumber';
import request from 'supertest';
import { MembershipRole } from '../../../src/modules/identity/domain/membership-role.enum';
import { addUserForLoginFake } from '../support/user-repository.fake';
import { addBusinessFake, addUserFake, membershipRepositoryFake } from '../support/membership-repository.fake';
import { TopWorld } from '../support/world';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { ratePlanRepositoryFake } from '../support/rate-plan-repository.fake';
import { BlockType } from '../../../src/modules/block/domain/block-type.enum';

const businessA = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const businessB = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const targetUserId = '11111111-1111-4111-8111-111111111112';
const resourceId = '11111111-1111-4111-8111-111111111113';
const ratePlanId = '99999999-9999-4999-8999-999999999999';

async function authenticatedWith(this: TopWorld, memberships: Array<{ businessId: string; role: MembershipRole }>): Promise<void> {
  const user = addUserForLoginFake('roles@example.com', 'contraseña válida');
  addUserFake(user.id);
  for (const membership of memberships) {
    addBusinessFake(membership.businessId);
    await membershipRepositoryFake.create({ userId: user.id, ...membership });
  }
  this.accessToken = `token:${user.id}`;
}

Given('existe un usuario OWNER en Business A y VIEWER en Business B', async function (this: TopWorld) {
  await authenticatedWith.call(this, [{ businessId: businessA, role: MembershipRole.OWNER }, { businessId: businessB, role: MembershipRole.VIEWER }]);
});

Given('existe un usuario RECEPTIONIST en Business A', async function (this: TopWorld) {
  await authenticatedWith.call(this, [{ businessId: businessA, role: MembershipRole.RECEPTIONIST }]);
});

Given('existe un usuario OWNER en Business A', async function (this: TopWorld) {
  await authenticatedWith.call(this, [{ businessId: businessA, role: MembershipRole.OWNER }]);
});

Given('existe un usuario ADMIN en Business A', async function (this: TopWorld) {
  await authenticatedWith.call(this, [{ businessId: businessA, role: MembershipRole.ADMIN }]);
});

Given('existe un usuario VIEWER en Business A', async function (this: TopWorld) {
  await authenticatedWith.call(this, [{ businessId: businessA, role: MembershipRole.VIEWER }]);
});

Given('existe un usuario objetivo para permisos', function (): void { addUserFake(targetUserId); });

Given('existe un Resource activo para permisos', function (): void {
  addResourceFake(Resource.create({ id: resourceId, businessId: businessA, name: 'Cabaña', internalCode: 'PERM-1', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }));
});

Given('existe una tarifa calculable para permisos', async function (): Promise<void> {
  addResourceFake(Resource.create({ id: resourceId, businessId: businessA, name: 'Cabaña', internalCode: 'PERM-1', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }));
  await ratePlanRepositoryFake.create({ businessId: businessA, name: 'Estándar', description: null, baseNightlyAmountMinor: 100000, currency: 'PYG', validFrom: null, validTo: null, resourceIds: [resourceId] });
});

When('intenta actualizar administrativamente Business B', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessB}`).set('Authorization', `Bearer ${this.accessToken}`).send({ name: 'No autorizado' });
});

When('consulta Business B', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessB}`).set('Authorization', `Bearer ${this.accessToken}`);
});

When('intenta modificar Business B', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessB}`).set('Authorization', `Bearer ${this.accessToken}`).send({ name: 'No autorizado' });
});

When('intenta administrar memberships de Business A', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/memberships`).set('Authorization', `Bearer ${this.accessToken}`).send({ userId: '11111111-1111-4111-8111-111111111111', role: MembershipRole.VIEWER });
});

When('modifica Business A', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessA}`).set('Authorization', `Bearer ${this.accessToken}`).send({ name: 'Business autorizado' });
});

When('crea una Booking operativa en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/bookings`).set('Authorization', `Bearer ${this.accessToken}`).send({}); });
When('intenta crear un Resource en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/resources`).set('Authorization', `Bearer ${this.accessToken}`).send({ name: 'No permitido', internalCode: 'NO' }); });
When('crea un Block operativo en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/resources/${resourceId}/blocks`).set('Authorization', `Bearer ${this.accessToken}`).send({ type: BlockType.OTHER, reason: 'Operación', startsAt: '2030-12-20T10:00:00-03:00', endsAt: '2030-12-21T10:00:00-03:00' }); });
When('intenta cambiar reglas de Availability en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessA}/availability-rules`).set('Authorization', `Bearer ${this.accessToken}`).send({ pendingBlocksAvailability: false }); });
When('calcula el precio estándar en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/rate-plans/${ratePlanId}/calculate`).set('Authorization', `Bearer ${this.accessToken}`).send({ resourceId, checkIn: '2026-09-10', checkOut: '2026-09-11' }); });
When('intenta cambiar Pricing en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessA}/rate-plans/${ratePlanId}`).set('Authorization', `Bearer ${this.accessToken}`).send({ baseNightlyAmountMinor: 200000 }); });
When('intenta asignar OWNER en Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessA}/memberships`).set('Authorization', `Bearer ${this.accessToken}`).send({ userId: targetUserId, role: MembershipRole.OWNER }); });
When('intenta archivar Business A', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessA}/archive`).set('Authorization', `Bearer ${this.accessToken}`); });
When('consulta Business A para permisos', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessA}`).set('Authorization', `Bearer ${this.accessToken}`); });
When('intenta modificar Business A para permisos', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessA}`).set('Authorization', `Bearer ${this.accessToken}`).send({ name: 'No permitido' }); });
When('intenta crear un User global', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${this.accessToken}`).send({ email: 'global@example.com', password: 'contraseña válida' }); });
When('intenta deshabilitar otro User global', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${targetUserId}/disable`).set('Authorization', `Bearer ${this.accessToken}`); });
