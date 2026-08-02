import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { TopWorld } from '../support/world';

Given('existen negocios registrados', function (this: TopWorld) {
  assert.ok(this.app);
});

When('creo un negocio llamado {string}', async function (this: TopWorld, name: string) {
  this.response = await request(this.app?.getHttpServer()).post('/api/businesses').send({ name });
});

When('consulto el negocio con identificador {string}', async function (this: TopWorld, id: string) {
  this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${id}`);
});

When('consulto la lista de negocios', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).get('/api/businesses');
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
