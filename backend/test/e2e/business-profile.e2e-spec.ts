import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/config/configure-application';
import { validateEnvironment } from '../../src/config/environment';
import { ArchiveBusinessUseCase } from '../../src/modules/business/application/archive-business.use-case';
import { CreateBusinessUseCase } from '../../src/modules/business/application/create-business.use-case';
import { BusinessNotFoundError, GetBusinessByIdUseCase } from '../../src/modules/business/application/get-business-by-id.use-case';
import { ListBusinessesUseCase } from '../../src/modules/business/application/list-businesses.use-case';
import { UpdateBusinessUseCase } from '../../src/modules/business/application/update-business.use-case';
import {
  BUSINESS_CHANGE_REPOSITORY,
  BusinessChangeConflictError,
  BusinessChangeForbiddenError,
  BusinessTimezoneHistoryError,
  type BusinessChangeRepository,
} from '../../src/modules/business/domain/business-change.repository';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessController } from '../../src/modules/business/presentation/business.controller';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { AuthorizationPolicy } from '../../src/shared/application/authorization-policy';
import { AuthenticationGuard } from '../../src/shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../../src/shared/security/business-authorization.guard';

const actorUserId = 'b10b0001-1111-4111-8111-111111111111';
const forgedUserId = 'b10b0002-2222-4222-8222-222222222222';
const businessId = 'b10b0003-3333-4333-8333-333333333333';
const otherBusinessId = 'b10b0004-4444-4444-8444-444444444444';
const secret = 'business-profile-e2e-synthetic-secret';
const version = '2026-10-01T00:00:00.123Z';
const occurredAt = new Date(version);
const endpoint = `/api/businesses/${businessId}`;

describe('Contrato HTTP del perfil de establecimiento con JWT y permisos tenant', () => {
  let app: INestApplication;
  let userStatus: UserStatus;
  let role: MembershipRole;
  const jwt = new JwtService();
  const saved = Business.create({
    id: businessId, businessNumber: 5, name: 'Nombre guardado', legalName: 'Razón guardada', taxId: 'ID de prueba',
    country: 'Paraguay', region: 'Central', city: 'Areguá', address: 'Dirección de prueba',
    timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE,
    createdAt: occurredAt, updatedAt: new Date(occurredAt.getTime() + 1),
  });
  const expectedResponse = {
    id: businessId, name: saved.name, legalName: saved.legalName, taxId: saved.taxId,
    country: saved.country, region: saved.region, city: saved.city, address: saved.address,
    timezone: saved.timezone, currency: saved.currency, status: saved.status,
    createdAt: saved.createdAt.toISOString(), updatedAt: saved.updatedAt.toISOString(),
  };
  const changes = {
    changeProfile: jest.fn<ReturnType<BusinessChangeRepository['changeProfile']>, Parameters<BusinessChangeRepository['changeProfile']>>(),
    archive: jest.fn<ReturnType<BusinessChangeRepository['archive']>, Parameters<BusinessChangeRepository['archive']>>(),
  } satisfies BusinessChangeRepository;
  const lookup = { findById: jest.fn<Promise<User | null>, [string]>() };
  const memberships = {
    findByUserAndBusiness: jest.fn<Promise<UserBusinessMembership | null>, [string, string]>(),
    findByUserId: jest.fn(), create: jest.fn(),
  };
  const bearer = (): Promise<string> => jwt.signAsync({ sub: actorUserId }, { secret, algorithm: 'HS256', expiresIn: 900 });
  const validChange = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'Nombre solicitado', expectedUpdatedAt: version, ...overrides,
  });

  beforeAll(async () => {
    const configuration = validateEnvironment({
      NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/business_profile_test',
      JWT_ACCESS_SECRET: secret,
    });
    const module = await Test.createTestingModule({
      controllers: [BusinessController],
      providers: [
        { provide: CreateBusinessUseCase, useValue: { execute: jest.fn() } },
        { provide: GetBusinessByIdUseCase, useValue: { execute: jest.fn() } },
        { provide: ListBusinessesUseCase, useValue: { execute: jest.fn() } },
        UpdateBusinessUseCase, ArchiveBusinessUseCase,
        { provide: BUSINESS_CHANGE_REPOSITORY, useValue: changes },
        { provide: USER_BY_ID_LOOKUP, useValue: lookup },
        { provide: MEMBERSHIP_REPOSITORY, useValue: memberships },
        { provide: ACCESS_TOKEN_VERIFIER, useFactory: () => new JwtAccessTokenIssuer(jwt, new ConfigService(configuration)) },
        AuthenticationGuard, BusinessAuthorizationGuard, AuthorizationPolicy,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApplication(app, { configuration });
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    userStatus = UserStatus.ACTIVE;
    role = MembershipRole.OWNER;
    changes.changeProfile.mockReset().mockResolvedValue(saved);
    changes.archive.mockReset();
    lookup.findById.mockReset().mockImplementation((id) => Promise.resolve(id === actorUserId ? User.create({
      id: actorUserId, email: 'business-profile-actor@example.test', displayName: 'Actor de prueba',
      status: userStatus, createdAt: occurredAt, updatedAt: occurredAt,
    }) : null));
    memberships.findByUserAndBusiness.mockReset().mockImplementation((actor, business) => Promise.resolve(
      actor === actorUserId && business === businessId ? UserBusinessMembership.create({
        id: 'b10b0005-5555-4555-8555-555555555555', userId: actor, businessId: business,
        role, createdAt: occurredAt, updatedAt: occurredAt,
      }) : null,
    ));
    memberships.findByUserId.mockReset();
    memberships.create.mockReset();
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN])('permite editar con %s y devuelve el DTO público', async (permittedRole) => {
    role = permittedRole;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(200, expectedResponse);
    expect(changes.changeProfile).toHaveBeenCalledWith({
      id: businessId, actorUserId, expectedUpdatedAt: occurredAt, changes: { name: 'Nombre solicitado' },
    });
    expect(changes.archive).not.toHaveBeenCalled();
  });

  it.each([MembershipRole.RECEPTIONIST, MembershipRole.VIEWER])('rechaza editar con %s antes del puerto', async (deniedRole) => {
    role = deniedRole;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ role: 'OWNER', actorUserId: forgedUserId })).expect(403);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza el establecimiento de otro tenant aunque el body declare el propio', async () => {
    await request(app.getHttpServer()).patch(`/api/businesses/${otherBusinessId}`)
      .set('Authorization', `Bearer ${await bearer()}`).send(validChange({ businessId, role: 'OWNER' })).expect(403);
    expect(memberships.findByUserAndBusiness).toHaveBeenCalledWith(actorUserId, otherBusinessId);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer malformed', 'Basic abc'])('rechaza Authorization %p', async (authorization) => {
    const operation = request(app.getHttpServer()).patch(endpoint).send(validChange());
    if (authorization) operation.set('Authorization', authorization);
    await operation.expect(401);
    expect(lookup.findById).not.toHaveBeenCalled();
    expect(memberships.findByUserAndBusiness).not.toHaveBeenCalled();
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza al actor DISABLED aunque su JWT siga vigente', async () => {
    const token = await bearer();
    userStatus = UserStatus.DISABLED;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(validChange()).expect(401);
    expect(memberships.findByUserAndBusiness).not.toHaveBeenCalled();
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza un actor que dejó de existir', async () => {
    lookup.findById.mockResolvedValue(null);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`).send(validChange()).expect(401);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza JWT con firma ajena', async () => {
    const token = await jwt.signAsync({ sub: actorUserId }, { secret: 'another-synthetic-secret', algorithm: 'HS256', expiresIn: 900 });
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(validChange()).expect(401);
    expect(lookup.findById).not.toHaveBeenCalled();
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('normaliza campos y descarta actor, tenant, estado y fechas enviados por cliente', async () => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`).send(validChange({
      name: '  Nombre solicitado  ', legalName: '  Razón de prueba  ', taxId: '  ID fiscal de prueba  ',
      country: '  Paraguay  ', region: '  Central  ', city: '  Areguá  ', address: '  Dirección de prueba  ',
      timezone: 'Europe/Madrid', currency: 'PYG', actorUserId: forgedUserId, businessId: otherBusinessId,
      id: otherBusinessId, status: 'ARCHIVED', role: 'OWNER', updatedAt: '2030-01-01T00:00:00.000Z',
      createdAt: '2030-01-01T00:00:00.000Z', reason: 'Motivo inyectado', unknownField: 'Ignorar',
    })).expect(200, expectedResponse);
    expect(changes.changeProfile).toHaveBeenCalledWith({
      id: businessId, actorUserId, expectedUpdatedAt: occurredAt, changes: {
        name: 'Nombre solicitado', legalName: 'Razón de prueba', taxId: 'ID fiscal de prueba',
        country: 'Paraguay', region: 'Central', city: 'Areguá', address: 'Dirección de prueba',
        timezone: 'Europe/Madrid', currency: 'PYG',
      },
    });
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it.each([null, '', ' \t\n '])('admite limpieza explícita opcional %p sin exigir nombre', async (value) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`).send({
      expectedUpdatedAt: version, legalName: value, taxId: value, country: value, region: value, city: value, address: value,
    }).expect(200);
    expect(changes.changeProfile).toHaveBeenCalledWith({
      id: businessId, actorUserId, expectedUpdatedAt: occurredAt,
      changes: { legalName: null, taxId: null, country: null, region: null, city: null, address: null },
    });
  });

  it.each([null, '', ' \t\n ', 123, false, [], {}, 'a'.repeat(121)].map((name) => ({ name })))('rechaza nombre inválido $name sin llamar al puerto', async ({ name }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ name })).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, '', 123, false, [], {}, 'invalid', '2026-02-30T00:00:00.000Z',
    '2026-10-01T00:00:00Z', '2026-10-01T00:00:00.123+00:00', ` ${version} `,
  ].map((expectedUpdatedAt) => ({ expectedUpdatedAt })))('rechaza versión ausente o no canónica $expectedUpdatedAt', async ({ expectedUpdatedAt }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ expectedUpdatedAt })).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza un body que solo aporta versión o campos protegidos', async () => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send({ expectedUpdatedAt: version, actorUserId: forgedUserId, status: 'ARCHIVED' }).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  const locationLimits = [
    { field: 'country', maximum: 120 }, { field: 'region', maximum: 120 },
    { field: 'city', maximum: 120 }, { field: 'address', maximum: 500 },
  ];

  it.each(locationLimits)('acepta $field en el límite después de trim', async ({ field, maximum }) => {
    const value = 'a'.repeat(maximum);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send({ expectedUpdatedAt: version, [field]: `  ${value}  ` }).expect(200);
    expect(changes.changeProfile).toHaveBeenCalledWith({
      id: businessId, actorUserId, expectedUpdatedAt: occurredAt, changes: { [field]: value },
    });
  });

  it.each(locationLimits)('rechaza $field por encima del límite normalizado', async ({ field, maximum }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ [field]: `  ${'a'.repeat(maximum + 1)}  ` })).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it.each(['USD', 'EUR', 'pyg', null])('rechaza moneda %p sin convertir importes', async (currency) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ currency })).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it('rechaza zona horaria inexistente', async () => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ timezone: 'Invalid/Time_Zone' })).expect(400);
    expect(changes.changeProfile).not.toHaveBeenCalled();
  });

  it.each([
    { error: new BusinessTimezoneHistoryError('La zona horaria se conserva por historial operativo.'), status: 400 },
    { error: new BusinessChangeConflictError('El establecimiento fue actualizado.'), status: 409 },
    { error: new BusinessChangeForbiddenError('La membresía ya no permite editar.'), status: 403 },
    { error: new BusinessNotFoundError('El negocio no existe.'), status: 404 },
  ])('mapea el error del puerto a HTTP $status sin reintentar', async ({ error, status }) => {
    changes.changeProfile.mockRejectedValueOnce(error);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(status);
    expect(changes.changeProfile).toHaveBeenCalledTimes(1);
  });

  it('expone la regla de historial como 400 y permite reintentar metadata con timezone actual y misma versión', async () => {
    const reason = 'No se puede cambiar la zona horaria con historial. Conserva la zona horaria actual para guardar los demás datos.';
    changes.changeProfile.mockRejectedValueOnce(new BusinessTimezoneHistoryError(reason));
    const rejected = await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ timezone: 'America/New_York' })).expect(400);
    expect(rejected.body).toEqual({ statusCode: 400, error: 'Bad Request', message: reason });
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ timezone: 'America/Asuncion', city: 'Ciudad corregida' })).expect(200);
    expect(changes.changeProfile).toHaveBeenLastCalledWith({ id: businessId, actorUserId, expectedUpdatedAt: occurredAt,
      changes: { name: 'Nombre solicitado', timezone: 'America/Asuncion', city: 'Ciudad corregida' } });
  });

  it('no expone detalles internos ante un fallo inesperado del puerto', async () => {
    changes.changeProfile.mockRejectedValueOnce(new Error('Detalle interno sintético'));
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(500, { statusCode: 500, message: 'Internal server error' });
  });
});
