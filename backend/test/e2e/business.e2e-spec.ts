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

  beforeAll(async () => {
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
});
