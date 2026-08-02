import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';

describe('Business endpoint', () => {
  let app: INestApplication;
  let listedBusinesses: Business[];

  beforeAll(async () => {
    const business = Business.create({
      id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
      businessNumber: null,
      name: 'Cabañas del Lago',
      legalName: 'Cabañas del Lago S.R.L.',
      taxId: '80000000-0',
      timezone: 'America/Asuncion',
      currency: 'PYG',
      status: BusinessStatus.ACTIVE,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const repository = {
      create: (data: { name: string; legalName?: string; taxId?: string }): Promise<Business> => {
        const now = new Date('2026-08-01T00:00:00.000Z');

        return Promise.resolve(Business.create({
          id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
          businessNumber: null,
          name: data.name,
          legalName: data.legalName ?? null,
          taxId: data.taxId ?? null,
          timezone: 'America/Asuncion',
          currency: 'PYG',
          status: BusinessStatus.ACTIVE,
          createdAt: now,
          updatedAt: now,
        }));
      },
      findById: (id: string): Promise<Business | null> => Promise.resolve(id === business.id ? business : null),
      list: (): Promise<Business[]> => Promise.resolve(listedBusinesses),
    };
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue(repository)
      .compile();

    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listedBusinesses = [];
  });

  it('crea un negocio mediante HTTP', async () => {
    await request(app.getHttpServer())
      .post('/api/businesses')
      .send({ name: 'Cabañas del Lago', legalName: 'Cabañas del Lago S.R.L.' })
      .expect('Content-Type', /json/)
      .expect(201)
      .expect(({ body }: { body: { name: string; status: string; currency: string } }) => {
        expect(body.name).toBe('Cabañas del Lago');
        expect(body.status).toBe('ACTIVE');
        expect(body.currency).toBe('PYG');
      });
  });

  it('recupera un negocio existente mediante HTTP sin exponer businessNumber', async () => {
    await request(app.getHttpServer())
      .get('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual({
          id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
          name: 'Cabañas del Lago',
          legalName: 'Cabañas del Lago S.R.L.',
          taxId: '80000000-0',
          timezone: 'America/Asuncion',
          currency: 'PYG',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        });
      });
  });

  it('responde 404 para un negocio inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0002')
      .expect(404);
  });

  it('responde 400 para un identificador inválido', async () => {
    await request(app.getHttpServer()).get('/api/businesses/no-es-uuid').expect(400);
  });

  it('retorna una lista vacía mediante HTTP', async () => {
    await request(app.getHttpServer()).get('/api/businesses').expect(200).expect([]);
  });

  it('retorna negocios ordenados por fecha de creación sin exponer businessNumber', async () => {
    const firstDate = new Date('2026-01-01T00:00:00.000Z');
    const secondDate = new Date('2026-01-02T00:00:00.000Z');
    listedBusinesses = [
      Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0003', businessNumber: 3, name: 'Primero', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: firstDate, updatedAt: firstDate }),
      Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0004', businessNumber: 4, name: 'Segundo', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: secondDate, updatedAt: secondDate }),
    ];

    await request(app.getHttpServer())
      .get('/api/businesses')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body.map((business) => business.id)).toEqual([listedBusinesses[0].id, listedBusinesses[1].id]);
        expect(body.map((business) => business.createdAt)).toEqual([firstDate.toISOString(), secondDate.toISOString()]);
        expect(body.every((business) => !('businessNumber' in business))).toBe(true);
      });
  });
});
