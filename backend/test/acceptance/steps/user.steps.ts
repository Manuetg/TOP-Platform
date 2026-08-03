import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { credentialCount, userCount } from '../support/user-repository.fake';
import { TopWorld } from '../support/world';

const validPassword = 'contraseña válida';
const email = 'Propietario+demo@Ejemplo.COM';

Given('no existe un usuario con el email indicado', function (this: TopWorld) { assert.equal(userCount(), 0); });
Given('existe un usuario con el email normalizado', async function (this: TopWorld) { await request(this.app?.getHttpServer()).post('/api/users').send({ email, password: validPassword }).expect(201); });
Given('no existe el usuario', function (this: TopWorld) { assert.equal(userCount(), 0); });
When('creo un usuario con email y contraseña válidos', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post('/api/users').send({ email: `  ${email}  `, password: validPassword }); });
When('intento crear otro usuario usando mayúsculas y espacios en el mismo email', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post('/api/users').send({ email: `  ${email.toUpperCase()}  `, password: validPassword }); });
When('intento crearlo con una contraseña de 11 caracteres', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post('/api/users').send({ email, password: 'x'.repeat(11) }); });
When('lo creo con una contraseña Unicode de al menos 12 caracteres', async function (this: TopWorld) { this.response = await request(this.app?.getHttpServer()).post('/api/users').send({ email, password: 'contraseña ñ válida' }); });
Then('el email queda normalizado', function (this: TopWorld) { assert.equal(this.response?.body.email, 'propietario+demo@ejemplo.com'); });
Then('el usuario queda ACTIVE', function (this: TopWorld) { assert.equal(this.response?.body.status, 'ACTIVE'); });
Then('la respuesta no contiene password', function (this: TopWorld) { assert.equal('password' in (this.response?.body ?? {}), false); });
Then('la respuesta no contiene passwordHash', function (this: TopWorld) { assert.equal('passwordHash' in (this.response?.body ?? {}), false); });
Then('no se crea un segundo usuario', function () { assert.equal(userCount(), 1); });
Then('no se crea una segunda credencial', function () { assert.equal(credentialCount(), 1); });
Then('no se persiste User', function () { assert.equal(userCount(), 0); });
Then('no se persiste LocalCredential', function () { assert.equal(credentialCount(), 0); });
Then('la respuesta no expone datos sensibles', function (this: TopWorld) { assert.equal('password' in (this.response?.body ?? {}), false); assert.equal('passwordHash' in (this.response?.body ?? {}), false); });
