import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/config/configure-application';
import { TopWorld } from '../support/world';

Before(async function (this: TopWorld) {
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  this.app = module.createNestApplication();
  configureApplication(this.app);
  await this.app.init();
});

After(async function (this: TopWorld) {
  await this.app?.close();
});

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
