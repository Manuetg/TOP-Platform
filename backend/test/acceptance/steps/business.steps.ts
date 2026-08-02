import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { TopWorld } from '../support/world';

Given('existen negocios registrados', function (this: TopWorld) {
  assert.ok(this.app);
});
Given('existe un negocio con nombre, razón social, RUC, zona horaria y moneda', function (this: TopWorld) { assert.ok(this.app); });
Given('existe un negocio con razón social y RUC', function (this: TopWorld) { assert.ok(this.app); });
Given('existe un negocio', function (this: TopWorld) { assert.ok(this.app); });

When('creo un negocio llamado {string}', async function (this: TopWorld, name: string) {
  this.response = await request(this.app?.getHttpServer()).post('/api/businesses').send({ name });
});

When('consulto el negocio con identificador {string}', async function (this: TopWorld, id: string) {
  this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${id}`);
});

When('consulto la lista de negocios', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).get('/api/businesses');
});

When('actualizo el negocio con nombre {string} y razón social {string}', async function (this: TopWorld, name: string, legalName: string) {
  this.response = await request(this.app?.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001').send({ name, legalName });
});

When('actualizo razón social y RUC a null', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001').send({ legalName: null, taxId: null });
});

When('intento actualizarlo con una moneda distinta de PYG', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001').send({ currency: 'USD' });
});

When('intento actualizarlo con una zona horaria inválida', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001').send({ timezone: 'invalid' });
});

Then('recibo una respuesta de creación exitosa', function (this: TopWorld) {
  assert.equal(this.response?.status, 201);
  assert.match(this.response?.headers['content-type'] ?? '', /json/);
});

Then('el negocio creado está activo', function (this: TopWorld) {
  assert.equal(this.response?.body.status, 'ACTIVE');
});

Then('recibo los datos públicos del negocio', function (this: TopWorld) {
  assert.equal(this.response?.status, 200);
  assert.equal(this.response?.body.id, 'f8c49800-e50e-4d0e-b82b-0b51c09a0001');
  assert.equal(this.response?.body.name, 'Cabañas del Lago');
  assert.equal('businessNumber' in (this.response?.body ?? {}), false);
});

Then('recibo la lista ordenada de negocios', function (this: TopWorld) {
  assert.equal(this.response?.status, 200);
  assert.deepEqual(this.response?.body.map((business: { id: string }) => business.id), [
    'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
    'f8c49800-e50e-4d0e-b82b-0b51c09a0002',
  ]);
  assert.equal(this.response?.body.every((business: Record<string, unknown>) => !('businessNumber' in business)), true);
});

Then('recibo HTTP 200', function (this: TopWorld) { assert.equal(this.response?.status, 200); });
Then('recibo HTTP 400', function (this: TopWorld) { assert.equal(this.response?.status, 400); });
Then('el nombre y la razón social quedan actualizados', function (this: TopWorld) { assert.equal(this.response?.body.name, 'Cabañas Nuevas'); assert.equal(this.response?.body.legalName, 'Cabañas Nuevas S.A.'); });
Then('el RUC, zona horaria y moneda permanecen sin cambios', function (this: TopWorld) { assert.equal(this.response?.body.taxId, '80000000-0'); assert.equal(this.response?.body.timezone, 'America/Asuncion'); assert.equal(this.response?.body.currency, 'PYG'); });
Then('razón social y RUC quedan en null', function (this: TopWorld) { assert.equal(this.response?.body.legalName, null); assert.equal(this.response?.body.taxId, null); });
Then('el negocio no se modifica', function (this: TopWorld) { assert.equal(this.response?.body.message, 'La moneda debe ser PYG.'); });
Then('recibo el mensaje de zona horaria inválida', function (this: TopWorld) { assert.equal(this.response?.body.message, 'La zona horaria no es válida.'); });
Then('la respuesta no contiene businessNumber', function (this: TopWorld) { assert.equal('businessNumber' in (this.response?.body ?? {}), false); });
