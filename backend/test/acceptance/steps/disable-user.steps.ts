import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { UserStatus } from '../../../src/modules/identity/domain/user-status.enum';
import { addUserForLoginFake, getUserByIdFake, userStatusRepositoryFake } from '../support/user-repository.fake';
import { TopWorld } from '../support/world';

const email = 'disable@example.com';
const password = 'contraseña válida';
let userId = '';
let refreshToken = '';

function addUser(status: UserStatus): void {
  userId = addUserForLoginFake(email, password, status).id;
}

Given('existe un usuario activo para deshabilitar', function (): void { addUser(UserStatus.ACTIVE); });
Given('existe un usuario deshabilitado para deshabilitar', function (): void { addUser(UserStatus.DISABLED); });
Given('el usuario para deshabilitar no existe', function (): void { userId = '11111111-1111-4111-8111-111111111111'; });

When('deshabilito el usuario', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}/disable`);
});
When('deshabilito nuevamente el usuario', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}/disable`);
});
When('intento deshabilitarlo', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch(`/api/users/${userId}/disable`);
});
When('intento deshabilitar un usuario con UUID inválido', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).patch('/api/users/inválido/disable');
});
When('intento iniciar sesión con el usuario deshabilitado', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).post('/api/auth/login').send({ email, password });
});
Given('el usuario fue deshabilitado', function (): void {
  const user = getUserByIdFake(userId);
  if (!user) throw new Error('El usuario de aceptación no existe.');
  void userStatusRepositoryFake.update(user.disable());
});
Given('existe un usuario activo con una sesión de refresh válida para deshabilitar', async function (this: TopWorld): Promise<void> {
  addUser(UserStatus.ACTIVE);
  const response = await request(this.app?.getHttpServer()).post('/api/auth/login').send({ email, password });
  refreshToken = response.body.refreshToken as string;
});
When('intento renovar la sesión del usuario deshabilitado', async function (this: TopWorld): Promise<void> {
  this.response = await request(this.app?.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
});
Then('el usuario queda DISABLED', function (): void { assert.equal(getUserByIdFake(userId)?.status, UserStatus.DISABLED); });
Then('el usuario continúa DISABLED', function (): void { assert.equal(getUserByIdFake(userId)?.status, UserStatus.DISABLED); });
