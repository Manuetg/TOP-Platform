import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { UserStatus } from '../../../src/modules/identity/domain/user-status.enum';
import { addUserForLoginFake, getUserByIdFake, userStatusRepositoryFake } from '../support/user-repository.fake';
import { TopWorld } from '../support/world';

const originalEmail = 'update-user@example.com';
const password = 'contraseña válida';
let userId = '';
let accessToken = '';
let refreshToken = '';

async function login(world: TopWorld): Promise<void> {
  const response = await request(world.app?.getHttpServer()).post('/api/auth/login').send({ email: originalEmail, password }).expect(200);
  accessToken = response.body.accessToken as string;
  refreshToken = response.body.refreshToken as string;
}

Given('existe un User ACTIVE autenticable para actualizar', function (): void {
  userId = addUserForLoginFake(originalEmail, password, UserStatus.ACTIVE).id;
});

Given('existe un User DISABLED para actualizar', async function (this: TopWorld): Promise<void> {
  userId = addUserForLoginFake(originalEmail, password, UserStatus.ACTIVE).id;
  await login(this);
  const user = getUserByIdFake(userId);
  if (!user) throw new Error('El User de aceptación no existe.');
  await userStatusRepositoryFake.update(user.disable());
});

Given('inició sesión antes de intentar cambiar correo', async function (this: TopWorld): Promise<void> { await login(this); });

When('intenta cambiar su propio correo', async function (this: TopWorld): Promise<void> {
  await login(this);
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}`).set('Authorization', `Bearer ${accessToken}`).send({ email: ' NUEVO+Alias@Ejemplo.COM ', status: 'DISABLED', role: 'OWNER', passwordHash: 'forbidden' });
});

When('intenta actualizar otro User', async function (this: TopWorld): Promise<void> {
  await login(this);
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${randomUUID()}`).set('Authorization', `Bearer ${accessToken}`).send({ email: 'other@example.com' });
});

When('intenta actualizarse con su access token', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}`).set('Authorization', `Bearer ${accessToken}`).send({ email: 'blocked@example.com' });
});

When('intenta cambiar su correo conservando la sesión', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}`).set('Authorization', `Bearer ${accessToken}`).send({ email: 'new-session@example.com' });
  assert.equal(this.response.status, 409);
  assert.equal(this.response.body.code, 'EMAIL_CHANGE_UNAVAILABLE');
});

When('solicita el mismo correo con espacios y mayúsculas', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}`).set('Authorization', `Bearer ${accessToken}`).send({ email: ` ${originalEmail.toUpperCase()} ` });
});

Then('el cambio de correo queda suspendido y conserva la identidad', function (this: TopWorld): void {
  assert.equal(this.response?.body.code, 'EMAIL_CHANGE_UNAVAILABLE');
  assert.equal(getUserByIdFake(userId)?.email, originalEmail);
});
Then('el mismo correo queda normalizado', function (this: TopWorld): void { assert.equal(this.response?.body.email, originalEmail); });
Then('Update User conserva estado y campos protegidos', function (this: TopWorld): void {
  assert.equal(getUserByIdFake(userId)?.status, UserStatus.ACTIVE);
  assert.equal('passwordHash' in (this.response?.body ?? {}), false);
  assert.equal('role' in (this.response?.body ?? {}), false);
});
Then('puede renovar la sesión previa', async function (this: TopWorld): Promise<void> {
  await request(this.app?.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(200);
});
