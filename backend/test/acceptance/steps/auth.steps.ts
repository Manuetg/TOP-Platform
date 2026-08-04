import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { MembershipRole } from '../../../src/modules/identity/domain/membership-role.enum';
import { UserStatus } from '../../../src/modules/identity/domain/user-status.enum';
import { addBusinessFake, addUserFake, membershipRepositoryFake } from '../support/membership-repository.fake';
import { addUserForLoginFake } from '../support/user-repository.fake';
import { TopWorld } from '../support/world';

const email = 'propietario@example.com';
const password = 'contraseña válida';
let userId = '';

function addLoginUser(disabled = false): void {
  userId = addUserForLoginFake(email, password, disabled ? UserStatus.DISABLED : UserStatus.ACTIVE).id;
}

async function createMembership(businessId: string, role: MembershipRole): Promise<void> {
  addUserFake(userId);
  addBusinessFake(businessId);
  await membershipRepositoryFake.create({ userId, businessId, role });
}

Given('existe un usuario habilitado para iniciar sesión', function () {
  addLoginUser();
});

Given('existe un usuario habilitado sin membresías', function () {
  addLoginUser();
});

Given('existe un usuario habilitado con varias membresías', async function () {
  addLoginUser();
  await createMembership('22222222-2222-4222-8222-222222222222', MembershipRole.OWNER);
  await createMembership('33333333-3333-4333-8333-333333333333', MembershipRole.VIEWER);
});

Given('existe un usuario deshabilitado para iniciar sesión', function () {
  addLoginUser(true);
});

When('inicio sesión con sus credenciales válidas', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).post('/api/auth/login').send({ email, password });
});

When('inicio sesión usando espacios y mayúsculas en el email', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).post('/api/auth/login').send({ email: '  PROPIETARIO@EXAMPLE.COM  ', password });
});

When('inicio sesión con una contraseña incorrecta', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).post('/api/auth/login').send({ email, password: 'contraseña incorrecta' });
});

Then('recibo un token Bearer de 900 segundos', function (this: TopWorld) {
  assert.equal(this.response?.body.tokenType, 'Bearer');
  assert.equal(this.response?.body.expiresIn, 900);
});

Then('el email de la sesión está normalizado', function (this: TopWorld) {
  assert.equal(this.response?.body.user.email, email);
});

Then('recibo una lista vacía de membresías', function (this: TopWorld) {
  assert.deepEqual(this.response?.body.memberships, []);
});

Then('recibo las membresías disponibles', function (this: TopWorld) {
  assert.deepEqual(this.response?.body.memberships, [
    { businessId: '22222222-2222-4222-8222-222222222222', role: MembershipRole.OWNER },
    { businessId: '33333333-3333-4333-8333-333333333333', role: MembershipRole.VIEWER },
  ]);
});

Then('recibo un refresh token opaco', function (this: TopWorld) {
  assert.equal(typeof this.response?.body.refreshToken, 'string');
  assert.ok(this.response?.body.refreshToken.length > 0);
});
