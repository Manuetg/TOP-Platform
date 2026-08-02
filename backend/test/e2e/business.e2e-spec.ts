import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { UpdateBusinessUseCase } from '../../src/modules/business/application/update-business.use-case';

describe('Business endpoint', () => {
  let app: INestApplication;
  let listedBusinesses: Business[];
  let updateBusinessUseCase: UpdateBusinessUseCase;
  let repositoryUpdate: jest.MockedFunction<(business: Business) => Promise<Business>>;

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
    repositoryUpdate = jest.fn((updatedBusiness: Business) => Promise.resolve(updatedBusiness));
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
      update: repositoryUpdate,
    };
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue(repository)
      .compile();

    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    updateBusinessUseCase = module.get(UpdateBusinessUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listedBusinesses = [];
    repositoryUpdate.mockClear();
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

  it('actualiza parcialmente un negocio sin exponer businessNumber', async () => {
    await request(app.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001').send({ name: 'Cabañas Actualizadas' }).expect(200).expect(({ body }: { body: Record<string, unknown> }) => {
      expect(body.name).toBe('Cabañas Actualizadas');
      expect(body.legalName).toBe('Cabañas del Lago S.R.L.');
      expect(body).not.toHaveProperty('businessNumber');
    });
  });

  it('archiva un negocio existente sin exponer businessNumber', async () => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001/archive')
      .send()
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.status).toBe('ARCHIVED');
        expect(body).not.toHaveProperty('businessNumber');
      });
  });

  it('responde 400 al archivar con un identificador inválido', async () => {
    await request(app.getHttpServer()).patch('/api/businesses/no-es-uuid/archive').send().expect(400);
  });

  it('responde 404 al archivar un negocio inexistente', async () => {
    await request(app.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0002/archive').send().expect(404);
  });

  it.each<{ url: string; body: Record<string, string> }>([
    { url: '/api/businesses/no-es-uuid', body: { name: 'Válido' } },
  ])('rechaza actualizaciones inválidas', async ({ url, body }) => {
    await request(app.getHttpServer()).patch(url).send(body).expect(400);
  });

  it('rechaza una actualización sin campos', async () => {
    const executeSpy = jest.spyOn(updateBusinessUseCase, 'execute');

    try {
      await request(app.getHttpServer())
        .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
        .send({})
        .expect(400)
        .expect(({ body }: { body: { message: string } }) => {
          expect(body.message).toBe('Se requiere al menos un campo actualizable.');
        });

      expect(executeSpy).toHaveBeenCalledWith('f8c49800-e50e-4d0e-b82b-0b51c09a0001', {
        name: undefined,
        legalName: undefined,
        taxId: undefined,
        timezone: undefined,
        currency: undefined,
      });
      expect(repositoryUpdate).not.toHaveBeenCalled();
    } finally {
      executeSpy.mockRestore();
    }
  });

  it('rechaza un nombre compuesto solo por espacios', async () => {
    const executeSpy = jest.spyOn(updateBusinessUseCase, 'execute');

    try {
      await request(app.getHttpServer())
        .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
        .send({ name: ' ' })
        .expect(400)
        .expect(({ body }: { body: { message: string } }) => {
          expect(body.message).toBe('El nombre del negocio es obligatorio.');
        });

      expect(executeSpy).toHaveBeenCalledWith('f8c49800-e50e-4d0e-b82b-0b51c09a0001', { name: ' ' });
      expect(repositoryUpdate).not.toHaveBeenCalled();
    } finally {
      executeSpy.mockRestore();
    }
  });

  it('rechaza una zona horaria inválida', async () => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .send({ timezone: 'invalid' })
      .expect(400)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('La zona horaria no es válida.');
      });
  });

  it('acepta una zona horaria IANA válida', async () => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .send({ timezone: 'America/Asuncion' })
      .expect(200)
      .expect(({ body }: { body: { timezone: string } }) => {
        expect(body.timezone).toBe('America/Asuncion');
      });
  });

  it('acepta PYG como moneda de actualización', async () => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .send({ currency: 'PYG' })
      .expect(200)
      .expect(({ body }: { body: { currency: string } }) => {
        expect(body.currency).toBe('PYG');
      });
  });

  it.each(['USD', 'EUR', ''])('rechaza %s como moneda de actualización', async (currency) => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .send({ currency })
      .expect(400)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('La moneda debe ser PYG.');
      });
  });

  it('rechaza null como moneda de actualización', async () => {
    await request(app.getHttpServer())
      .patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0001')
      .send({ currency: null })
      .expect(400)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('La moneda debe ser PYG.');
      });
  });

  it('responde 404 al actualizar un negocio inexistente', async () => {
    await request(app.getHttpServer()).patch('/api/businesses/f8c49800-e50e-4d0e-b82b-0b51c09a0002').send({ name: 'Nuevo' }).expect(404);
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
