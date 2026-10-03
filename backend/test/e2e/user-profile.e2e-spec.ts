import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/config/configure-application';
import { validateEnvironment } from '../../src/config/environment';
import { CreateUserUseCase } from '../../src/modules/identity/application/create-user.use-case';
import { DisableUserUseCase } from '../../src/modules/identity/application/disable-user.use-case';
import { GetUserProfileUseCase } from '../../src/modules/identity/application/get-user-profile.use-case';
import { UpdateUserProfileUseCase } from '../../src/modules/identity/application/update-user-profile.use-case';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileNotFoundError } from '../../src/modules/identity/application/user-profile.errors';
import { UpdateUserUseCase } from '../../src/modules/identity/application/update-user.use-case';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { USER_PROFILE_CHANGE_REPOSITORY, type UserProfileChange } from '../../src/modules/identity/domain/user-profile-change.repository';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { User, type UserProps } from '../../src/modules/identity/domain/user.entity';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { UserController } from '../../src/modules/identity/presentation/user.controller';
import { AuthorizationPolicy } from '../../src/shared/application/authorization-policy';
import { AuthenticationGuard } from '../../src/shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../../src/shared/security/business-authorization.guard';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const missingUserId = '33333333-3333-4333-8333-333333333333';
const businessId = '44444444-4444-4444-8444-444444444444';
const secret = 'user-profile-e2e-only-secret';
const createdAt = new Date('2026-09-01T00:00:00.000Z');
const emailVerifiedAt = new Date('2026-09-02T00:00:00.000Z');
const endpoint = `/api/users/${userId}/profile`;
const methods = ['get', 'patch'] as const;
const auditReason = 'Actualización del perfil por su titular.';
const profileValues = (user: User) => ({
  birthYear: user.birthYear ?? null, username: user.username ?? null, phone: user.phone ?? null, avatarId: user.avatarId ?? null,
});

function updatedProfileValues(input: UserProfileChange, previous: User): ReturnType<typeof profileValues> {
  const current = profileValues(previous);
  return {
    birthYear: input.birthYear === undefined ? current.birthYear : input.birthYear,
    username: input.username === undefined ? current.username : input.username,
    phone: input.phone === undefined ? current.phone : input.phone,
    avatarId: input.avatarId === undefined ? current.avatarId : input.avatarId,
  };
}

interface ProfileAudit {
  entity: 'User';
  entityId: string;
  actorUserId: string;
  occurredAt: string;
  previousDisplayName: string | null;
  displayName: string;
  reason: string;
  previousProfile: ReturnType<typeof profileValues>;
  profile: ReturnType<typeof profileValues>;
}

function createUser(overrides: Partial<UserProps> = {}): User {
  return User.create({
    id: userId,
    email: 'perfil@example.test',
    displayName: 'Nombre vigente',
    emailVerifiedAt,
    status: UserStatus.ACTIVE,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
}

describe('Perfil personal auditado con JWT, SELF y control de versión', () => {
  let app: INestApplication;
  let persistedUser: User;
  let memberships: UserBusinessMembership[];
  let auditEvents: ProfileAudit[];
  const jwt = new JwtService();
  const lookup = { findById: jest.fn<Promise<User | null>, [string]>() };
  const profileChanges = { changeDisplayName: jest.fn<Promise<User>, [UserProfileChange]>() };
  const membershipRepository = {
    findByUserAndBusiness: jest.fn<Promise<UserBusinessMembership | null>, [string, string]>(),
    findByUserId: jest.fn<Promise<UserBusinessMembership[]>, [string]>(),
    create: jest.fn(),
  };
  const bearer = (): Promise<string> => jwt.signAsync({ sub: userId }, { secret, algorithm: 'HS256', expiresIn: 900 });
  const expectedProfile = (displayName: string | null = persistedUser.displayName ?? null): object => ({
    id: userId,
    email: persistedUser.email,
    displayName,
    ...profileValues(persistedUser),
    status: UserStatus.ACTIVE,
    updatedAt: persistedUser.updatedAt.toISOString(),
  });
  const validChange = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    displayName: 'Nuevo nombre',
    expectedUpdatedAt: persistedUser.updatedAt.toISOString(),
    ...overrides,
  });

  beforeAll(async () => {
    const configuration = validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/user_profile_test',
      JWT_ACCESS_SECRET: secret,
    });
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: CreateUserUseCase, useValue: { execute: jest.fn() } },
        { provide: DisableUserUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateUserUseCase, useValue: { execute: jest.fn() } },
        GetUserProfileUseCase,
        UpdateUserProfileUseCase,
        { provide: USER_BY_ID_LOOKUP, useValue: lookup },
        { provide: USER_PROFILE_CHANGE_REPOSITORY, useValue: profileChanges },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: ACCESS_TOKEN_VERIFIER, useFactory: () => new JwtAccessTokenIssuer(jwt, new ConfigService(configuration)) },
        AuthenticationGuard,
        BusinessAuthorizationGuard,
        AuthorizationPolicy,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApplication(app, { configuration });
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    persistedUser = createUser();
    memberships = [];
    auditEvents = [];
    lookup.findById.mockReset().mockImplementation((id) => Promise.resolve(
      id === userId ? persistedUser : id === otherUserId ? createUser({ id: otherUserId, email: 'otra-persona@example.test' }) : null,
    ));
    profileChanges.changeDisplayName.mockReset().mockImplementation((input) => {
      if (input.id !== userId) return Promise.reject(new UserProfileNotFoundError('El usuario no existe.'));
      if (input.actorUserId !== userId || persistedUser.status !== UserStatus.ACTIVE) {
        return Promise.reject(new UserProfileForbiddenError('No se permite cambiar este perfil.'));
      }
      if (input.expectedUpdatedAt.getTime() !== persistedUser.updatedAt.getTime()) {
        return Promise.reject(new UserProfileConflictError('El perfil fue actualizado.'));
      }
      const optionalFields = ['birthYear', 'username', 'phone', 'avatarId'] as const;
      if (input.displayName === persistedUser.displayName && optionalFields.every(
        (field) => input[field] === undefined || input[field] === (persistedUser[field] ?? null),
      )) return Promise.resolve(persistedUser);
      const previous = persistedUser;
      const nextUpdatedAt = new Date(previous.updatedAt.getTime() + 1);
      persistedUser = User.create({
        id: previous.id, email: previous.email, displayName: input.displayName, emailVerifiedAt: previous.emailVerifiedAt,
        ...updatedProfileValues(input, previous),
        status: previous.status, createdAt: previous.createdAt, updatedAt: nextUpdatedAt,
      });
      auditEvents.push({
        entity: 'User', entityId: input.id, actorUserId: input.actorUserId, occurredAt: nextUpdatedAt.toISOString(),
        previousDisplayName: previous.displayName ?? null, displayName: input.displayName, reason: input.reason,
        previousProfile: profileValues(previous), profile: profileValues(persistedUser),
      });
      return Promise.resolve(persistedUser);
    });
    membershipRepository.findByUserAndBusiness.mockReset().mockImplementation((actor, business) => Promise.resolve(
      memberships.find((membership) => membership.userId === actor && membership.businessId === business) ?? null,
    ));
    membershipRepository.findByUserId.mockReset().mockImplementation((actor) => Promise.resolve(
      memberships.filter((membership) => membership.userId === actor),
    ));
    membershipRepository.create.mockReset();
  });

  it('lee los datos vigentes y devuelve únicamente el contrato público de perfil', async () => {
    const token = await bearer();
    persistedUser = createUser({
      displayName: 'Nombre actualizado en persistencia', email: 'correo-vigente@example.test', updatedAt: emailVerifiedAt,
      birthYear: 1990, username: 'alias vigente', phone: '+595981123456', avatarId: 'sun',
    });
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${token}`)
      .expect('Cache-Control', 'no-store')
      .expect(200, expectedProfile('Nombre actualizado en persistencia'));
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
  });

  it.each([undefined, null])('representa con null el nombre legacy %s', async (displayName) => {
    persistedUser = createUser({ displayName });
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .expect(200, expectedProfile(null));
  });

  it.each([undefined, ...Object.values(MembershipRole)])('permite leer y editar la identidad propia con membresía %s', async (role) => {
    if (role) memberships = [UserBusinessMembership.create({
      id: '55555555-5555-4555-8555-555555555555', userId, businessId, role, createdAt, updatedAt: createdAt,
    })];
    const token = await bearer();
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200, expectedProfile());
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`)
      .send(validChange({ displayName: 'Nombre propio' })).expect('Cache-Control', 'no-store').expect(200)
      .expect(({ body }) => expect(body).toEqual(expectedProfile('Nombre propio')));
    expect(membershipRepository.findByUserAndBusiness).not.toHaveBeenCalled();
    expect(membershipRepository.findByUserId).not.toHaveBeenCalled();
    expect(membershipRepository.create).not.toHaveBeenCalled();
  });

  it.each(methods)('%s rechaza otra identidad antes de consultar si el destino existe', async (method) => {
    const token = await bearer();
    for (const id of [otherUserId, missingUserId]) {
      lookup.findById.mockClear();
      await request(app.getHttpServer())[method](`/api/users/${id}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send(validChange({ actorUserId: id, userId: id, role: 'OWNER', businessId }))
        .expect(403);
      expect(lookup.findById).toHaveBeenCalledTimes(1);
      expect(lookup.findById).toHaveBeenCalledWith(userId);
      expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
    }
  });

  it.each(methods)('%s rechaza un identificador inválido', async (method) => {
    await request(app.getHttpServer())[method]('/api/users/not-a-uuid/profile')
      .set('Authorization', `Bearer ${await bearer()}`).send(validChange()).expect(400);
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
  });

  it.each(methods)('%s rechaza Authorization ausente o inválido', async (method) => {
    for (const authorization of [undefined, 'Bearer malformed', 'Basic abc']) {
      const operation = request(app.getHttpServer())[method](endpoint).send(validChange());
      if (authorization) operation.set('Authorization', authorization);
      await operation.expect(401);
    }
    expect(lookup.findById).not.toHaveBeenCalled();
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
  });

  it.each(methods)('%s rechaza de inmediato al actor DISABLED aunque el token siga vigente', async (method) => {
    const token = await bearer();
    persistedUser = createUser({ status: UserStatus.DISABLED });
    await request(app.getHttpServer())[method](endpoint).set('Authorization', `Bearer ${token}`).send(validChange()).expect(401);
    expect(lookup.findById).toHaveBeenCalledTimes(1);
  });

  it.each(methods)('%s rechaza un actor que ya no existe', async (method) => {
    lookup.findById.mockResolvedValue(null);
    await request(app.getHttpServer())[method](endpoint).set('Authorization', `Bearer ${await bearer()}`).send(validChange()).expect(401);
    expect(lookup.findById).toHaveBeenCalledTimes(1);
  });

  it.each(methods)('%s devuelve 404 si el actor desaparece después de autenticar', async (method) => {
    lookup.findById.mockResolvedValueOnce(persistedUser).mockResolvedValueOnce(null);
    await request(app.getHttpServer())[method](endpoint).set('Authorization', `Bearer ${await bearer()}`).send(validChange()).expect(404);
    expect(lookup.findById).toHaveBeenCalledTimes(2);
  });

  it('normaliza nombre y alias, audita con motivo automático y devuelve la nueva versión sin exponer auditoría', async () => {
    const token = await bearer();
    const initialVersion = persistedUser.updatedAt;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`)
      .send(validChange({ displayName: '  María López  ', birthYear: 1990, username: '  maria  ', phone: '+595981123456', avatarId: 'leaf' }))
      .expect('Cache-Control', 'no-store').expect(200)
      .expect(({ body }) => expect(body).toEqual(expectedProfile('María López')));
    expect(profileChanges.changeDisplayName).toHaveBeenCalledWith({
      id: userId, actorUserId: userId, displayName: 'María López', reason: auditReason, expectedUpdatedAt: initialVersion,
      birthYear: 1990, username: 'maria', phone: '+595981123456', avatarId: 'leaf',
    });
    expect(auditEvents).toEqual([{
      entity: 'User', entityId: userId, actorUserId: userId, occurredAt: persistedUser.updatedAt.toISOString(),
      previousDisplayName: 'Nombre vigente', displayName: 'María López', reason: auditReason,
      previousProfile: { birthYear: null, username: null, phone: null, avatarId: null },
      profile: { birthYear: 1990, username: 'maria', phone: '+595981123456', avatarId: 'leaf' },
    }]);
    expect(persistedUser.updatedAt.getTime()).toBeGreaterThan(initialVersion.getTime());
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200, expectedProfile('María López'));
  });

  it('ignora campos protegidos y toma el actor autenticado para el cambio y su auditoría', async () => {
    const token = await bearer();
    const originalEmail = persistedUser.email;
    const originalVerification = persistedUser.emailVerifiedAt;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(validChange({
      id: otherUserId,
      actorUserId: otherUserId,
      reason: 'Motivo inyectado',
      unknownField: 'dato desconocido',
      email: 'sin-verificar@example.test',
      emailVerifiedAt: null,
      status: 'DISABLED',
      updatedAt: '2030-01-01T00:00:00.000Z',
      createdAt: '2030-01-01T00:00:00.000Z',
      role: 'OWNER',
      businessId,
      password: 'password-sintético',
      passwordHash: 'hash-sintético',
      refreshToken: 'token-sintético',
      memberships: [{ businessId, role: 'OWNER' }],
    })).expect(200).expect(({ body }) => expect(body).toEqual(expectedProfile('Nuevo nombre')));
    expect(persistedUser.email).toBe(originalEmail);
    expect(persistedUser.emailVerifiedAt).toEqual(originalVerification);
    expect(persistedUser.status).toBe(UserStatus.ACTIVE);
    expect(persistedUser.createdAt).toEqual(createdAt);
    expect(auditEvents[0].actorUserId).toBe(userId);
    expect(auditEvents[0].reason).toBe(auditReason);
    expect(profileChanges.changeDisplayName).toHaveBeenCalledWith({
      id: userId, actorUserId: userId, displayName: 'Nuevo nombre', reason: auditReason, expectedUpdatedAt: createdAt,
    });
    expect(membershipRepository.create).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${token}`)
      .expect(200, expectedProfile('Nuevo nombre'));
  });

  it.each([1, 120])('acepta nombre de %i caracteres después de trim', async (length) => {
    const displayName = 'a'.repeat(length);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: ` ${displayName} ` })).expect(200)
      .expect(({ body }) => expect(body).toEqual(expectedProfile(displayName)));
    expect(auditEvents[0].displayName).toBe(displayName);
  });

  it.each([
    { name: 'ausente', value: undefined },
    { name: 'vacío', value: '' },
    { name: 'solo espacios', value: ' \t\n ' },
    { name: 'más de 120 caracteres', value: 'a'.repeat(121) },
    { name: 'null', value: null },
    { name: 'número', value: 123 },
    { name: 'booleano', value: true },
    { name: 'array', value: ['Nombre'] },
    { name: 'objeto', value: { value: 'Nombre' } },
  ])('rechaza nombre $name sin cambios ni evento', async ({ value }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: value })).expect(400);
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
    expect(persistedUser.displayName).toBe('Nombre vigente');
    expect(auditEvents).toEqual([]);
  });

  it('conserva todos los opcionales omitidos al actualizar solamente el nombre', async () => {
    persistedUser = createUser({ birthYear: 1990, username: 'alias vigente', phone: '+595981123456', avatarId: 'sun' });
    const initialValues = profileValues(persistedUser);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(200).expect(({ body }) => expect(body).toEqual(expectedProfile()));
    expect(profileValues(persistedUser)).toEqual(initialValues);
    expect(auditEvents[0].previousProfile).toEqual(initialValues);
    expect(auditEvents[0].profile).toEqual(initialValues);
  });

  it.each(['birthYear', 'username', 'phone', 'avatarId'] as const)('borra únicamente %s con null explícito y conserva el resto', async (field) => {
    persistedUser = createUser({ birthYear: 1990, username: 'alias vigente', phone: '+595981123456', avatarId: 'sun' });
    const previous = profileValues(persistedUser);
    const initialVersion = persistedUser.updatedAt;
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: persistedUser.displayName, [field]: null })).expect(200)
      .expect(({ body }) => expect(body).toEqual(expectedProfile()));
    expect(profileValues(persistedUser)).toEqual({ ...previous, [field]: null });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].previousProfile).toEqual(previous);
    expect(auditEvents[0].profile).toEqual({ ...previous, [field]: null });
    expect(auditEvents[0].reason).toBe(auditReason);
    expect(persistedUser.updatedAt.getTime()).toBeGreaterThan(initialVersion.getTime());
  });

  it.each([
    { field: 'birthYear', value: 1 }, { field: 'birthYear', value: new Date().getUTCFullYear() },
    { field: 'username', value: ' A ' }, { field: 'username', value: 'a'.repeat(50) },
    { field: 'phone', value: '+595981123456' }, { field: 'phone', value: '+14155552671' },
    ...['user', 'leaf', 'sun', 'mountain'].map((value) => ({ field: 'avatarId', value })),
  ])('admite $field=$value como cambio efectivo sin cambiar el nombre', async ({ field, value }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: persistedUser.displayName, [field]: value })).expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(expectedProfile('Nombre vigente'));
        expect(body[field]).toBe(field === 'username' ? String(value).trim() : value);
      });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].reason).toBe(auditReason);
  });

  it.each([
    ...[0, -1, 1990.5, new Date().getUTCFullYear() + 1, '1990', '', true, [], {}].map((value) => ({ field: 'birthYear', value })),
    ...['a'.repeat(51), 123, true, [], {}].map((value) => ({ field: 'username', value })),
    ...['0981123456', '595981123456', '+5959', '+999123456789', '+0123456789', '+14155552671 ext 1', '+14155552671123456', 123, true, [], {}].map((value) => ({ field: 'phone', value })),
    ...['', ' leaf ', 'USER', 'unknown', 'https://example.test/avatar.png', 'data:image/png;base64,AAAA', '../../private', 123, true, [], {}].map((value) => ({ field: 'avatarId', value })),
  ])('rechaza $field=$value sin cambios ni evento', async ({ field, value }) => {
    const initialProfile = expectedProfile();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ [field]: value })).expect(400);
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toEqual([]);
  });

  it.each(['', ' \t\n '])('normaliza alias y teléfono vacíos a null sin exigir datos opcionales', async (value) => {
    persistedUser = createUser({ username: 'alias vigente', phone: '+595981123456' });
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: persistedUser.displayName, username: value, phone: value })).expect(200)
      .expect(({ body }) => expect(body).toEqual(expectedProfile('Nombre vigente')));
    expect(persistedUser.username).toBeNull();
    expect(persistedUser.phone).toBeNull();
    expect(auditEvents).toHaveLength(1);
  });

  it('normaliza teléfono internacional con separadores a E.164', async () => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ phone: ' +1 415 555 2671 ' })).expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(expectedProfile());
        expect(body.phone).toBe('+14155552671');
      });
  });

  it('conserva versión y auditoría cuando todos los valores normalizados coinciden', async () => {
    persistedUser = createUser({ birthYear: 1990, username: 'alias vigente', phone: '+14155552671', avatarId: 'sun' });
    const initialProfile = expectedProfile();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: ' Nombre vigente ', birthYear: 1990, username: ' alias vigente ', phone: '+1 415 555 2671', avatarId: 'sun' }))
      .expect(200, initialProfile);
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toEqual([]);
  });

  it('rechaza versión obsoleta aunque los valores opcionales solicitados coincidan', async () => {
    const token = await bearer();
    const body = validChange({ displayName: persistedUser.displayName, birthYear: 1990 });
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(body).expect(200);
    const initialProfile = expectedProfile();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(body).expect(409);
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toHaveLength(1);
  });

  it('admite un solo cambio opcional para dos peticiones de la misma versión', async () => {
    const token = await bearer();
    const initialVersion = persistedUser.updatedAt.toISOString();
    const responses = await Promise.all(['leaf', 'mountain'].map((avatarId) =>
      request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`)
        .send(validChange({ displayName: 'Nombre vigente', avatarId, expectedUpdatedAt: initialVersion })),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].profile.avatarId).toBe(persistedUser.avatarId);
  });

  it.each(['', ' \t\n ', null, 123, true, [], {}, 'Motivo controlado por el cliente'])('descarta el motivo cliente %s y genera la auditoría automática', async (reason) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ reason })).expect(200);
    expect(auditEvents[0].reason).toBe(auditReason);
  });

  it.each([
    { name: 'ausente', value: undefined },
    { name: 'vacía', value: '' },
    { name: 'null', value: null },
    { name: 'número', value: 123 },
    { name: 'objeto', value: { value: createdAt.toISOString() } },
    { name: 'array', value: [createdAt.toISOString()] },
    { name: 'texto inválido', value: 'not-a-date' },
    { name: 'fecha inexistente', value: '2026-02-30T00:00:00.000Z' },
    { name: 'fecha sin hora', value: '2026-09-01' },
    { name: 'instante sin milisegundos', value: '2026-09-01T00:00:00Z' },
    { name: 'offset en vez de UTC canónico', value: '2026-09-01T00:00:00.000+00:00' },
    { name: 'espacios exteriores', value: ` ${createdAt.toISOString()} ` },
  ])('rechaza versión $name sin cambios ni evento', async ({ value }) => {
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ expectedUpdatedAt: value })).expect(400);
    expect(profileChanges.changeDisplayName).not.toHaveBeenCalled();
    expect(auditEvents).toEqual([]);
  });

  it('rechaza la versión obsoleta incluso al repetir el cambio ya confirmado', async () => {
    const token = await bearer();
    const body = validChange();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(body).expect(200);
    const confirmedProfile = expectedProfile();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`).send(body).expect(409);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`)
      .send({ ...body, displayName: 'Otro nombre' }).expect(409);
    expect(expectedProfile()).toEqual(confirmedProfile);
    expect(auditEvents).toHaveLength(1);
  });

  it('no genera evento ni modifica la versión si el nombre normalizado ya coincide y la versión es vigente', async () => {
    const initialProfile = expectedProfile();
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange({ displayName: '  Nombre vigente  ' })).expect(200, initialProfile);
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toEqual([]);
  });

  it('admite un solo cambio cuando dos solicitudes usan la misma versión esperada', async () => {
    const token = await bearer();
    const initialVersion = persistedUser.updatedAt.toISOString();
    const responses = await Promise.all(['Primer nombre', 'Segundo nombre'].map((displayName) =>
      request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${token}`)
        .send(validChange({ displayName, expectedUpdatedAt: initialVersion })),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].displayName).toBe(persistedUser.displayName);
  });

  it.each([
    { error: new UserProfileForbiddenError('El actor fue deshabilitado.'), status: 403 },
    { error: new UserProfileNotFoundError('El usuario desapareció.'), status: 404 },
  ])('mapea el fallo transaccional a $status sin confirmar cambios', async ({ error, status }) => {
    const initialProfile = expectedProfile();
    profileChanges.changeDisplayName.mockRejectedValueOnce(error);
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(status);
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toEqual([]);
  });

  it('devuelve un 500 genérico ante un fallo inesperado de lectura', async () => {
    lookup.findById.mockResolvedValueOnce(persistedUser).mockRejectedValueOnce(new Error('Detalle interno de lectura'));
    await request(app.getHttpServer()).get(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .expect(500, { statusCode: 500, message: 'Internal server error' });
  });

  it('devuelve un 500 genérico ante un fallo inesperado de escritura sin confirmar cambios ni evento', async () => {
    const initialProfile = expectedProfile();
    profileChanges.changeDisplayName.mockRejectedValueOnce(new Error('Detalle interno de escritura'));
    await request(app.getHttpServer()).patch(endpoint).set('Authorization', `Bearer ${await bearer()}`)
      .send(validChange()).expect(500, { statusCode: 500, message: 'Internal server error' });
    expect(expectedProfile()).toEqual(initialProfile);
    expect(auditEvents).toEqual([]);
  });
});
