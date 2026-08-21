import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { contactRepositoryFake } from '../support/contact-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001'; const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
Given('no existe un Contact para la prueba', function (): void {});
When('creo un Contact mínimo', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/contacts`).send({ name: 'María', phone: '0981123456' }); this.contactId = this.response.body.id as string; });
When('consulto el Contact creado', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessId}/contacts/${this.contactId}`); });
When('actualizo la ciudad del Contact', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/contacts/${this.contactId}`).send({ city: 'Asunción' }); });
Then('recibo el Contact público actualizado', function (this: TopWorld): void { assert.equal(this.response?.body.city, 'Asunción'); assert.equal('props' in (this.response?.body ?? {}), false); });
Given('existe un Contact en otro negocio', async function (): Promise<void> { await contactRepositoryFake.create({ businessId: otherBusinessId, name: 'María', lastName: null, phone: '0981000', whatsapp: null, email: null, documentType: null, documentNumber: null, country: null, city: null }); });
When('busco Contacts por María', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessId}/contacts?query=María`); });
Then('recibo una lista vacía de Contacts', function (this: TopWorld): void { assert.deepEqual(this.response?.body, []); });
