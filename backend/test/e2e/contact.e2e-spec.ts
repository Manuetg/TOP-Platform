import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { Contact } from '../../src/modules/contact/domain/contact.entity';
import { CONTACT_REPOSITORY } from '../../src/modules/contact/domain/contact.repository';
import { ContactStatus } from '../../src/modules/contact/domain/contact-status.enum';

const businessId = '11111111-1111-4111-8111-111111111111';
const otherBusinessId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';

describe('Contact endpoint', () => {
  let app: INestApplication;
  let contacts: Contact[];
  let business: Business | null;

  const businessEntity = (): Business =>
    Business.create({
      id: businessId,
      businessNumber: null,
      name: 'TOP',
      legalName: null,
      taxId: null,
      timezone: 'America/Asuncion',
      currency: 'PYG',
      status: BusinessStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue({
        findById: (id: string): Promise<Business | null> =>
          Promise.resolve(id === businessId ? business : null),
        create: jest.fn(),
        list: jest.fn(),
        update: jest.fn(),
      })
      .overrideProvider(CONTACT_REPOSITORY)
      .useValue({
        create: (data: {
          businessId: string;
          name: string;
          lastName: string | null;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          documentType: string | null;
          documentNumber: string | null;
          country: string | null;
          city: string | null;
        }): Promise<Contact> => {
          const created = Contact.create({
            id: contactId,
            ...data,
            status: ContactStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          contacts.push(created);
          return Promise.resolve(created);
        },
        findByIdAndBusinessId: (id: string, owner: string): Promise<Contact | null> =>
          Promise.resolve(
            contacts.find((contact) => contact.id === id && contact.businessId === owner) ?? null,
          ),
        searchByBusinessId: (owner: string, query: string | null): Promise<Contact[]> =>
          Promise.resolve(
            contacts.filter(
              (contact) =>
                contact.businessId === owner &&
                (query === null ||
                  [
                    contact.name,
                    contact.lastName,
                    contact.phone,
                    contact.whatsapp,
                    contact.email,
                    contact.documentNumber,
                  ].some((value) => value?.toLowerCase().includes(query.toLowerCase()))),
            ),
          ),
        update: (contact: Contact): Promise<Contact> => {
          contacts = contacts.map((item) => (item.id === contact.id ? contact : item));
          return Promise.resolve(contact);
        },
      })
      .compile();

    app = module.createNestApplication();
    configureApplication(app, { security: false });
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    contacts = [];
    business = businessEntity();
  });

  const body = {
    name: ' María ',
    phone: '0981123456',
    email: 'maria@example.com',
    documentNumber: '123',
  };

  it('creates, gets, searches and updates public contacts', async () => {
    await request(app.getHttpServer())
      .post(`/api/businesses/${businessId}/contacts`)
      .send(body)
      .expect(201)
      .expect(({ body: responseBody }: { body: Record<string, unknown> }) => {
        expect(responseBody).toMatchObject({ name: 'María', fullName: 'María', status: 'ACTIVE' });
        expect(responseBody).not.toHaveProperty('props');
      });

    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/contacts/${contactId}`).expect(200);
    await request(app.getHttpServer())
      .get(`/api/businesses/${businessId}/contacts?query=123`)
      .expect(200)
      .expect(({ body: responseBody }: { body: unknown[] }) => expect(responseBody).toHaveLength(1));
    await request(app.getHttpServer())
      .patch(`/api/businesses/${businessId}/contacts/${contactId}`)
      .send({ city: 'Asunción' })
      .expect(200)
      .expect(({ body: responseBody }: { body: { city: string; phone: string } }) =>
        expect(responseBody).toMatchObject({ city: 'Asunción', phone: '0981123456' }),
      );
  });

  it.each([{ name: 'M', phone: '1' }, { name: 'María' }, { name: 'María', phone: '1', email: 'bad' }])(
    'returns 400 for invalid creation input',
    async (invalid) => request(app.getHttpServer()).post(`/api/businesses/${businessId}/contacts`).send(invalid).expect(400),
  );

  it('returns 400 for invalid ids and empty updates', async () => {
    await request(app.getHttpServer()).get('/api/businesses/invalid/contacts/invalid').expect(400);
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/contacts`).send(body).expect(201);
    await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/contacts/${contactId}`).send({}).expect(400);
  });

  it('hides contacts across tenants and returns 404 for missing contacts', async () => {
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/contacts`).send(body).expect(201);
    await request(app.getHttpServer()).get(`/api/businesses/${otherBusinessId}/contacts/${contactId}`).expect(404);
    await request(app.getHttpServer())
      .patch(`/api/businesses/${businessId}/contacts/44444444-4444-4444-8444-444444444444`)
      .send({ city: 'Asunción' })
      .expect(404);
  });

  it('searches only within the business', async () => {
    contacts = [
      Contact.create({
        id: contactId,
        businessId: otherBusinessId,
        name: 'María',
        lastName: null,
        phone: '0981',
        whatsapp: null,
        email: null,
        documentType: null,
        documentNumber: null,
        country: null,
        city: null,
        status: ContactStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];

    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/contacts?query=María`).expect(200).expect([]);
  });
});
