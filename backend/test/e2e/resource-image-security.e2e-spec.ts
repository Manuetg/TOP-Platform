// Evitar la carga de .env del cliente generado: esta suite no utiliza Prisma ni servicios externos.
jest.mock('@prisma/client', () => ({ PrismaClient: class {} }));

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/config/configure-application';
import { validateEnvironment } from '../../src/config/environment';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { CreateResourceUseCase } from '../../src/modules/resource/application/create-resource.use-case';
import { DeleteResourceImageUseCase } from '../../src/modules/resource/application/delete-resource-image.use-case';
import { DisableResourceUseCase } from '../../src/modules/resource/application/disable-resource.use-case';
import { GetResourceUseCase } from '../../src/modules/resource/application/get-resource.use-case';
import { ListResourceImageCoversUseCase } from '../../src/modules/resource/application/list-resource-image-covers.use-case';
import { ListResourceImagesUseCase } from '../../src/modules/resource/application/list-resource-images.use-case';
import { ListResourcesUseCase } from '../../src/modules/resource/application/list-resources.use-case';
import { ReactivateResourceUseCase } from '../../src/modules/resource/application/reactivate-resource.use-case';
import { ReorderResourceImagesUseCase } from '../../src/modules/resource/application/reorder-resource-images.use-case';
import { SetResourceAmenitiesUseCase } from '../../src/modules/resource/application/set-resource-amenities.use-case';
import { UpdateResourceUseCase } from '../../src/modules/resource/application/update-resource.use-case';
import { UploadResourceImageUseCase } from '../../src/modules/resource/application/upload-resource-image.use-case';
import { FILE_STORAGE } from '../../src/modules/resource/domain/file-storage.port';
import { Resource } from '../../src/modules/resource/domain/resource.entity';
import { RESOURCE_REPOSITORY } from '../../src/modules/resource/domain/resource.repository';
import { ResourceImage } from '../../src/modules/resource/domain/resource-image.entity';
import { RESOURCE_IMAGE_REPOSITORY } from '../../src/modules/resource/domain/resource-image.repository';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';
import { ResourceController } from '../../src/modules/resource/presentation/resource.controller';
import { AuthorizationPolicy } from '../../src/shared/application/authorization-policy';
import { AuthenticationGuard } from '../../src/shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../../src/shared/security/business-authorization.guard';

const userId = '11111111-1111-4111-8111-111111111111';
const businessA = '22222222-2222-4222-8222-222222222222';
const businessB = '33333333-3333-4333-8333-333333333333';
const resourceA = '44444444-4444-4444-8444-444444444444';
const resourceB = '55555555-5555-4555-8555-555555555555';
const imageA = '66666666-6666-4666-8666-666666666666';
const secondImageA = '77777777-7777-4777-8777-777777777777';
const imageB = '88888888-8888-4888-8888-888888888888';
const unknownId = '99999999-9999-4999-8999-999999999999';
const date = new Date('2026-01-01T00:00:00.000Z');
const secret = 'synthetic-resource-image-security-secret';

const businesses = [businessA, businessB].map((id) => Business.create({
  id, businessNumber: null, name: 'Business de prueba', legalName: null, taxId: null,
  timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: date, updatedAt: date,
}));
const resources = [[resourceA, businessA], [resourceB, businessB]].map(([id, businessId]) => Resource.create({
  id, businessId, name: 'Recurso de prueba', internalCode: id, description: null,
  capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2,
  status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: date, updatedAt: date,
}));
const images = [[imageA, businessA, resourceA, 0], [secondImageA, businessA, resourceA, 1], [imageB, businessB, resourceB, 0]]
  .map(([id, businessId, resourceId, sortOrder]) => ResourceImage.create({
    id: String(id), businessId: String(businessId), resourceId: String(resourceId),
    storageKey: `synthetic/${id}`, mimeType: 'image/jpeg', sizeBytes: 1,
    sortOrder: Number(sortOrder), createdAt: date, updatedAt: date,
  }));

type Operation = 'covers' | 'delete' | 'order';
const operations: Operation[] = ['covers', 'delete', 'order'];
const writeOperations: Operation[] = ['delete', 'order'];

describe('Autorización HTTP de imágenes de Resource', () => {
  let app: INestApplication;
  let token: string;
  let userStatus = UserStatus.ACTIVE;
  let memberships: UserBusinessMembership[] = [];
  const tokens = new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret }));
  const membershipRepository = {
    findByUserAndBusiness: jest.fn((actor: string, tenant: string) => Promise.resolve(
      memberships.find((item) => item.userId === actor && item.businessId === tenant) ?? null,
    )),
  };
  const businessRepository = { findById: jest.fn((id: string) => Promise.resolve(businesses.find((item) => item.id === id) ?? null)) };
  const resourceRepository = {
    findByIdAndBusinessId: jest.fn((id: string, tenant: string) => Promise.resolve(
      resources.find((item) => item.id === id && item.businessId === tenant) ?? null,
    )),
  };
  const imageRepository = {
    listCoversByBusinessId: jest.fn((tenant: string) => Promise.resolve(images.filter((item) => item.businessId === tenant && item.sortOrder === 0))),
    listByResourceId: jest.fn((id: string) => Promise.resolve(images.filter((item) => item.resourceId === id))),
    findByIdAndResourceId: jest.fn((id: string, resource: string) => Promise.resolve(images.find((item) => item.id === id && item.resourceId === resource) ?? null)),
    deleteAndCompact: jest.fn(() => Promise.resolve()),
    reorder: jest.fn(() => Promise.resolve()),
  };
  const storage = {
    createSignedReadUrl: jest.fn((key: string) => Promise.resolve(`https://storage.example.invalid/${key}`)),
    delete: jest.fn(() => Promise.resolve()),
  };
  const membership = (businessId: string, role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({
    id: unknownId, userId, businessId, role, createdAt: date, updatedAt: date,
  });

  function perform(operation: Operation, tenant = businessA, resource = resourceA, image = imageA): request.Test {
    const base = `/api/businesses/${tenant}/resources`;
    if (operation === 'covers') return request(app.getHttpServer()).get(`${base}/images/covers`);
    if (operation === 'delete') return request(app.getHttpServer()).delete(`${base}/${resource}/images/${image}`);
    return request(app.getHttpServer()).put(`${base}/${resource}/images/order`).send({ imageIds: tenant === businessB ? [imageB] : [secondImageA, imageA] });
  }

  function expectNoDomainAccess(): void {
    expect(businessRepository.findById).not.toHaveBeenCalled();
    expect(resourceRepository.findByIdAndBusinessId).not.toHaveBeenCalled();
    for (const method of Object.values(imageRepository)) expect(method).not.toHaveBeenCalled();
    for (const method of Object.values(storage)) expect(method).not.toHaveBeenCalled();
  }

  function expectNoMutation(): void {
    expect(imageRepository.deleteAndCompact).not.toHaveBeenCalled();
    expect(imageRepository.reorder).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResourceController],
      providers: [
        AuthenticationGuard, BusinessAuthorizationGuard, AuthorizationPolicy,
        ListResourceImageCoversUseCase, DeleteResourceImageUseCase, ReorderResourceImagesUseCase,
        { provide: ACCESS_TOKEN_VERIFIER, useValue: tokens },
        { provide: USER_BY_ID_LOOKUP, useValue: { findById: (id: string) => Promise.resolve(id === userId ? { id, status: userStatus } : null) } },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: BUSINESS_REPOSITORY, useValue: businessRepository },
        { provide: RESOURCE_REPOSITORY, useValue: resourceRepository },
        { provide: RESOURCE_IMAGE_REPOSITORY, useValue: imageRepository },
        { provide: FILE_STORAGE, useValue: storage },
        ...[CreateResourceUseCase, GetResourceUseCase, ListResourcesUseCase, UpdateResourceUseCase,
          DisableResourceUseCase, ReactivateResourceUseCase, UploadResourceImageUseCase,
          ListResourceImagesUseCase, SetResourceAmenitiesUseCase].map((provide) => ({ provide, useValue: { execute: jest.fn() } })),
      ],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app, { configuration: validateEnvironment({
      NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1/top_image_security_test', JWT_ACCESS_SECRET: secret,
    }) });
    await app.listen(0, '127.0.0.1');
    token = (await tokens.issue({ sub: userId })).token;
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { jest.clearAllMocks(); userStatus = UserStatus.ACTIVE; memberships = []; });

  it.each(operations)('rechaza %s sin Bearer antes de acceder al dominio', async (operation) => {
    await perform(operation).expect(401);
    expect(membershipRepository.findByUserAndBusiness).not.toHaveBeenCalled();
    expectNoDomainAccess();
  });

  it.each(operations)('rechaza %s con token inválido', async (operation) => {
    await perform(operation).set('Authorization', 'Bearer invalid').expect(401);
    expectNoDomainAccess();
  });

  it.each(operations)('rechaza %s inmediatamente para User DISABLED', async (operation) => {
    memberships = [membership(businessA, MembershipRole.OWNER)];
    userStatus = UserStatus.DISABLED;
    await perform(operation).set('Authorization', `Bearer ${token}`).expect(401);
    expectNoDomainAccess();
  });

  it.each(operations)('rechaza %s sin membresía sin revelar si el Business existe', async (operation) => {
    const existing = await perform(operation).set('Authorization', `Bearer ${token}`).expect(403);
    const missing = await perform(operation, unknownId).set('Authorization', `Bearer ${token}`).expect(403);
    expect(existing.body).toEqual(missing.body);
    expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledWith(userId, businessA);
    expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledWith(userId, unknownId);
    expectNoDomainAccess();
  });

  it.each(operations)('rechaza %s de B para OWNER de A antes de consultar imágenes', async (operation) => {
    memberships = [membership(businessA, MembershipRole.OWNER)];
    await perform(operation, businessB, resourceB, imageB).set('Authorization', `Bearer ${token}`).expect(403);
    expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledWith(userId, businessB);
    expectNoDomainAccess();
  });

  it.each(Object.values(MembershipRole))('permite covers a %s y firma solamente imágenes del Business solicitado', async (role) => {
    memberships = [membership(businessA, role)];
    await perform('covers').set('Authorization', `Bearer ${token}`).expect(200, [{
      resourceId: resourceA, imageId: imageA, url: `https://storage.example.invalid/synthetic/${imageA}`,
    }]);
    expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledWith(userId, businessA);
    expect(imageRepository.listCoversByBusinessId).toHaveBeenCalledWith(businessA);
    expect(storage.createSignedReadUrl).toHaveBeenCalledTimes(1);
    expect(storage.createSignedReadUrl).toHaveBeenCalledWith(`synthetic/${imageA}`);
    expectNoMutation();
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN].flatMap((role) => writeOperations.map((operation) => [role, operation] as const)))(
    'permite %s ejecutar %s únicamente sobre su Resource', async (role, operation) => {
      memberships = [membership(businessA, role)];
      await perform(operation).set('Authorization', `Bearer ${token}`).expect(204);
      expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledWith(userId, businessA);
      expect(resourceRepository.findByIdAndBusinessId).toHaveBeenCalledWith(resourceA, businessA);
      if (operation === 'delete') {
        expect(imageRepository.deleteAndCompact).toHaveBeenCalledWith(resourceA, imageA);
        expect(storage.delete).toHaveBeenCalledWith(`synthetic/${imageA}`);
        expect(imageRepository.reorder).not.toHaveBeenCalled();
      } else {
        expect(imageRepository.reorder).toHaveBeenCalledWith(resourceA, [secondImageA, imageA]);
        expect(imageRepository.deleteAndCompact).not.toHaveBeenCalled();
        expect(storage.delete).not.toHaveBeenCalled();
      }
    });

  it.each([MembershipRole.RECEPTIONIST, MembershipRole.VIEWER].flatMap((role) => writeOperations.map((operation) => [role, operation] as const)))(
    'rechaza %s al ejecutar %s antes de acceder al dominio', async (role, operation) => {
      memberships = [membership(businessA, role)];
      await perform(operation).set('Authorization', `Bearer ${token}`).expect(403);
      expectNoDomainAccess();
    });

  it.each(writeOperations)('no hereda el permiso OWNER de A al ejecutar %s como VIEWER de B', async (operation) => {
    memberships = [membership(businessA, MembershipRole.OWNER), membership(businessB, MembershipRole.VIEWER)];
    await perform(operation, businessB, resourceB, imageB).set('Authorization', `Bearer ${token}`).expect(403);
    expectNoDomainAccess();
  });

  it.each(operations)('revalida la membresía vigente al ejecutar %s con el mismo JWT', async (operation) => {
    memberships = [membership(businessA, MembershipRole.OWNER)];
    await perform(operation).set('Authorization', `Bearer ${token}`).expect(operation === 'covers' ? 200 : 204);
    memberships = [];
    jest.clearAllMocks();
    await perform(operation).set('Authorization', `Bearer ${token}`).expect(403);
    expect(membershipRepository.findByUserAndBusiness).toHaveBeenCalledTimes(1);
    expectNoDomainAccess();
  });

  it.each(writeOperations)('responde igual para Resource ajeno e inexistente al ejecutar %s', async (operation) => {
    memberships = [membership(businessA, MembershipRole.OWNER)];
    const foreign = await perform(operation, businessA, resourceB).set('Authorization', `Bearer ${token}`).expect(404);
    const missing = await perform(operation, businessA, unknownId).set('Authorization', `Bearer ${token}`).expect(404);
    expect(foreign.body).toEqual(missing.body);
    expect(imageRepository.findByIdAndResourceId).not.toHaveBeenCalled();
    expect(imageRepository.listByResourceId).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it('responde igual al borrar una imagen ajena e inexistente del Resource autorizado', async () => {
    memberships = [membership(businessA, MembershipRole.ADMIN)];
    const foreign = await perform('delete', businessA, resourceA, imageB).set('Authorization', `Bearer ${token}`).expect(404);
    const missing = await perform('delete', businessA, resourceA, unknownId).set('Authorization', `Bearer ${token}`).expect(404);
    expect(foreign.body).toEqual(missing.body);
    expectNoMutation();
  });

  it('responde igual al ordenar con imágenes ajenas e inexistentes', async () => {
    memberships = [membership(businessA, MembershipRole.ADMIN)];
    const endpoint = `/api/businesses/${businessA}/resources/${resourceA}/images/order`;
    const foreign = await request(app.getHttpServer()).put(endpoint).set('Authorization', `Bearer ${token}`).send({ imageIds: [imageA, imageB] }).expect(400);
    const missing = await request(app.getHttpServer()).put(endpoint).set('Authorization', `Bearer ${token}`).send({ imageIds: [imageA, unknownId] }).expect(400);
    expect(foreign.body).toEqual(missing.body);
    expectNoMutation();
  });
});
