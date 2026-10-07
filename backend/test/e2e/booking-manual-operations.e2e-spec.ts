import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Booking } from '../../src/modules/booking/booking.contract';
import { BOOKING_OPERATION_TRANSACTION, BOOKING_OPERATION_TRANSITIONS, type BookingOperationData } from '../../src/modules/booking-lifecycle/booking-operation.contract';
import { OperateBookingUseCase } from '../../src/modules/booking-lifecycle/application/operate-booking.use-case';
import { BookingOperationConflictError } from '../../src/modules/booking-lifecycle/application/booking-operation.errors';
import { BookingOperationsController } from '../../src/modules/booking-lifecycle/presentation/booking-operations.controller';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { AuthorizationPolicy } from '../../src/shared/application/authorization-policy';
import { AuthenticationGuard } from '../../src/shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../../src/shared/security/business-authorization.guard';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const expectedUpdatedAt = '2026-10-02T12:00:00.123Z';
const secret = 'booking-operations-synthetic-e2e-secret';
const paths = ['check-in', 'check-out', 'no-show', 'confirm-without-payment'] as const;

describe('HTTP de operaciones manuales: JWT, tenant, rol y versión', () => {
  let app: INestApplication;
  let role: MembershipRole | undefined;
  let userStatus = UserStatus.ACTIVE;
  const transaction = jest.fn((data: BookingOperationData) => Promise.resolve(Booking.create({ id: bookingId, businessId, status: BOOKING_OPERATION_TRANSITIONS[data.operation].to, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(expectedUpdatedAt), updatedAt: new Date('2026-10-02T12:00:00.124Z') })));
  const jwt = new JwtService();
  const bearer = (): Promise<string> => jwt.signAsync({ sub: actorUserId }, { secret, algorithm: 'HS256', expiresIn: 900 });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingOperationsController],
      providers: [OperateBookingUseCase, AuthenticationGuard, BusinessAuthorizationGuard, AuthorizationPolicy,
        { provide: BOOKING_OPERATION_TRANSACTION, useValue: { execute: transaction } },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret })) },
        { provide: USER_BY_ID_LOOKUP, useValue: { findById: (id: string) => Promise.resolve(id === actorUserId ? User.create({ id, email: 'actor@operations.test', status: userStatus, createdAt: new Date(), updatedAt: new Date() }) : null) } },
        { provide: MEMBERSHIP_REPOSITORY, useValue: { findByUserAndBusiness: (userId: string, owner: string) => Promise.resolve(role && userId === actorUserId && owner === businessId ? UserBusinessMembership.create({ id: '44444444-4444-4444-8444-444444444444', userId, businessId: owner, role, createdAt: new Date(), updatedAt: new Date() }) : null) } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalGuards(app.get(AuthenticationGuard), app.get(BusinessAuthorizationGuard));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => app.close());
  beforeEach(() => { transaction.mockClear(); role = MembershipRole.RECEPTIONIST; userStatus = UserStatus.ACTIVE; });

  it.each(paths)('exige autenticación y niega VIEWER para %s', async (path) => {
    const endpoint = `/api/businesses/${businessId}/bookings/${bookingId}/${path}`;
    await request(app.getHttpServer()).post(endpoint).send({ expectedUpdatedAt }).expect(401);
    role = MembershipRole.VIEWER;
    await request(app.getHttpServer()).post(endpoint).set('Authorization', `Bearer ${await bearer()}`).send({ expectedUpdatedAt }).expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST])('autoriza %s en los cuatro endpoints y deriva actor del token', async (operationalRole) => {
    role = operationalRole;
    const token = await bearer();
    for (const path of paths) {
      const response = await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings/${bookingId}/${path}`).set('Authorization', `Bearer ${token}`).send({ expectedUpdatedAt, actorUserId: '55555555-5555-4555-8555-555555555555' }).expect(200);
      expect(response.body).toMatchObject({ id: bookingId, businessId, updatedAt: '2026-10-02T12:00:00.124Z' });
    }
    expect(transaction).toHaveBeenCalledTimes(4);
    for (const [data] of transaction.mock.calls) expect(data.actorUserId).toBe(actorUserId);
  });

  it('rechaza el tenant sin membresía y User DISABLED antes de ejecutar', async () => {
    const token = await bearer();
    await request(app.getHttpServer()).post(`/api/businesses/55555555-5555-4555-8555-555555555555/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${token}`).send({ expectedUpdatedAt }).expect(403);
    userStatus = UserStatus.DISABLED;
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${token}`).send({ expectedUpdatedAt }).expect(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([{}, { expectedUpdatedAt: '2026-10-02' }, { expectedUpdatedAt, reason: 4 }, { expectedUpdatedAt, reason: 'x' }])('valida body antes de la transacción: %p', async (body) => {
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${await bearer()}`).send(body).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('devuelve409 de versión y nunca publica una confirmación optimista', async () => {
    transaction.mockRejectedValueOnce(new BookingOperationConflictError('La reserva cambió.'));
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings/${bookingId}/check-in`).set('Authorization', `Bearer ${await bearer()}`).send({ expectedUpdatedAt }).expect(409).expect(({ body }) => expect(body).toMatchObject({ message: 'La reserva cambió.' }));
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
