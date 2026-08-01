import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { TopWorld } from '../support/world';

Given('el backend de TOP está iniciado', function (this: TopWorld) {
  assert.ok(this.app, 'La aplicación NestJS debe estar iniciada.');
});

When('consulto el endpoint de salud', async function (this: TopWorld) {
  this.response = await request(this.app?.getHttpServer()).get('/api/health');
});

Then('recibo una respuesta exitosa', function (this: TopWorld) {
  assert.equal(this.response?.status, 200);
  assert.match(this.response?.headers['content-type'] ?? '', /json/);
});

Then('el estado informado es saludable', function (this: TopWorld) {
  assert.deepEqual(this.response?.body, { status: 'ok' });
});
