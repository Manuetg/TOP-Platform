import { Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { TopWorld } from '../support/world';

When('creo un negocio llamado {string}', async function (this: TopWorld, name: string) {
  this.response = await request(this.app?.getHttpServer()).post('/api/businesses').send({ name });
});

Then('recibo una respuesta de creación exitosa', function (this: TopWorld) {
  assert.equal(this.response?.status, 201);
  assert.match(this.response?.headers['content-type'] ?? '', /json/);
});

Then('el negocio creado está activo', function (this: TopWorld) {
  assert.equal(this.response?.body.status, 'ACTIVE');
});
