import { Given, When } from '@cucumber/cucumber';
import request from 'supertest';
import { MembershipRole } from '../../../src/modules/identity/domain/membership-role.enum';
import { addUserForLoginFake } from '../support/user-repository.fake';
import { addBusinessFake, addUserFake, membershipRepositoryFake } from '../support/membership-repository.fake';
import { TopWorld } from '../support/world';

const businessA = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const businessB = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';

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
