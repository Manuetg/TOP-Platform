import { Controller, Get, type INestApplication, ParseUUIDPipe, Param, Patch, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import { AnyBusinessRole, BusinessAccess, Public } from '../../src/shared/security/security.decorators';
import { BOOKING_REPOSITORY, BOOKING_TIMELINE_REPOSITORY } from '../../src/modules/booking/booking.contract';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';

const secret = 'security-e2e-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const otherBusinessId = '33333333-3333-4333-8333-333333333333';
const timelineBookingId='44444444-4444-4444-8444-444444444444';
const timelineBooking=Booking.create({id:timelineBookingId,businessId,status:BookingStatus.CANCELLED,contactId:null,resourceIds:[],checkInDate:null,checkOutDate:null,adults:null,children:null,notes:null,createdAt:new Date(),updatedAt:new Date()});

@Controller('security-probe')
class SecurityProbeController {
  @Public() @Get('public') publicRoute(): object { return { public: true }; }
  @Get('default') protectedByDefault(): object { return { protected: true }; }
  @BusinessAccess('businessId') @Get('businesses/:businessId') tenant(@Param('businessId', new ParseUUIDPipe()) id: string): object { return { businessId: id }; }
  @BusinessAccess('businessId') @Post('businesses/:businessId/mutable') mutable(@Param('businessId', new ParseUUIDPipe()) id: string): object { return { businessId: id }; }
  @BusinessAccess('businessId', 'OWNER', 'ADMIN') @Patch('businesses/:businessId/administrative') administrative(@Param('businessId', new ParseUUIDPipe()) id: string): object { return { businessId: id }; }
  @AnyBusinessRole('OWNER', 'ADMIN') @Get('admin') admin(): object { return { admin: true }; }
}

describe('Protección JWT y membresía', () => {
  let app: INestApplication;
  let userStatus = UserStatus.ACTIVE;
  let memberships: UserBusinessMembership[] = [];
  const jwt = new JwtService();
  const membership = (id: string, role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({ id: `${id.slice(0, 24)}444444444444`, userId, businessId: id, role, createdAt: new Date(), updatedAt: new Date() });
  const bearer = async (options: { subject?: string; signingSecret?: string; algorithm?: 'HS256' | 'HS384'; expiresIn?: number } = {}): Promise<string> => jwt.signAsync(
    options.subject === undefined ? { sub: userId } : options.subject ? { sub: options.subject } : {},
    { secret: options.signingSecret ?? secret, algorithm: options.algorithm ?? 'HS256', expiresIn: options.expiresIn ?? 900 },
  );

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule], controllers: [SecurityProbeController] })
      .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: (id: string) => Promise.resolve(id === userId ? User.create({ id: userId, email: 'security@example.com', status: userStatus, createdAt: new Date(), updatedAt: new Date() }) : null) })
      .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({
        findByUserAndBusiness: (requestedUserId: string, requestedBusinessId: string) => Promise.resolve(memberships.find((item) => item.userId === requestedUserId && item.businessId === requestedBusinessId) ?? null),
        findByUserId: (requestedUserId: string) => Promise.resolve(memberships.filter((item) => item.userId === requestedUserId)),
        create: jest.fn(),
      })
      .overrideProvider(BOOKING_REPOSITORY).useValue({findByIdAndBusinessId:(id:string,owner:string)=>Promise.resolve(id===timelineBookingId&&owner===businessId?timelineBooking:null)})
      .overrideProvider(BOOKING_TIMELINE_REPOSITORY).useValue({list:()=>Promise.resolve([])})
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => { userStatus = UserStatus.ACTIVE; memberships = []; });

  it('mantiene públicas Health, Swagger y una ruta marcada', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    await request(app.getHttpServer()).get('/api/security-probe/public').expect(200);
  });

  it.each([
    [undefined, 401],
    ['Basic abc', 401],
    ['Bearer', 401],
    ['Bearer ', 401],
    ['Bearer malformed', 401],
  ])('rechaza Authorization inválido: %s', async (authorization, status) => {
    const operation = request(app.getHttpServer()).get('/api/security-probe/default');
    if (authorization) operation.set('Authorization', authorization);
    await operation.expect(status);
  });

  it('rechaza firma, algoritmo, expiración y sub inválidos', async () => {
    const tokens = [
      await bearer({ signingSecret: 'wrong-secret' }),
      await bearer({ algorithm: 'HS384' }),
      await bearer({ expiresIn: -1 }),
      await bearer({ subject: '' }),
      await bearer({ subject: 'invalid-sub' }),
    ];
    for (const token of tokens) await request(app.getHttpServer()).get('/api/security-probe/default').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rechaza un refresh token opaco como Bearer', async () => {
    await request(app.getHttpServer()).get('/api/security-probe/default').set('Authorization', 'Bearer opaque-refresh-token').expect(401);
  });

  it('permite un access token válido y rechaza inmediatamente User DISABLED', async () => {
    const token = await bearer();
    await request(app.getHttpServer()).get('/api/security-probe/default').set('Authorization', `Bearer ${token}`).expect(200);
    userStatus = UserStatus.DISABLED;
    await request(app.getHttpServer()).get('/api/security-probe/default').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('autoriza solo los Businesses de las membresías del User', async () => {
    memberships = [membership(businessId, MembershipRole.VIEWER), membership(otherBusinessId, MembershipRole.RECEPTIONIST)];
    const token = await bearer();
    await request(app.getHttpServer()).get(`/api/security-probe/businesses/${businessId}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get('/api/security-probe/businesses/44444444-4444-4444-8444-444444444444').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('mantiene 400 para businessId inválido', async () => {
    await request(app.getHttpServer()).get('/api/security-probe/businesses/not-a-uuid').set('Authorization', `Bearer ${await bearer()}`).expect(400);
  });

  it('exige OWNER o ADMIN en una operación administrativa global', async () => {
    const token = await bearer();
    memberships = [membership(businessId, MembershipRole.VIEWER)];
    await request(app.getHttpServer()).get('/api/security-probe/admin').set('Authorization', `Bearer ${token}`).expect(403);
    memberships = [membership(businessId, MembershipRole.ADMIN)];
    await request(app.getHttpServer()).get('/api/security-probe/admin').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('mantiene roles por tenant y VIEWER en solo lectura', async () => {
    const token = await bearer();
    memberships = [membership(businessId, MembershipRole.OWNER), membership(otherBusinessId, MembershipRole.VIEWER)];
    await request(app.getHttpServer()).get(`/api/security-probe/businesses/${otherBusinessId}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).post(`/api/security-probe/businesses/${otherBusinessId}/mutable`).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).patch(`/api/security-probe/businesses/${otherBusinessId}/administrative`).set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).patch(`/api/security-probe/businesses/${businessId}/administrative`).set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('rechaza RECEPTIONIST en una operación OWNER/ADMIN', async () => {
    memberships = [membership(businessId, MembershipRole.RECEPTIONIST)];
    await request(app.getHttpServer()).patch(`/api/security-probe/businesses/${businessId}/administrative`).set('Authorization', `Bearer ${await bearer()}`).expect(403);
  });

  it('protege por defecto una ruta sin metadata', async () => {
    await request(app.getHttpServer()).get('/api/security-probe/default').expect(401);
  });

  it('protege Booking Timeline con JWT activo y membresía del tenant',async()=>{const endpoint=`/api/businesses/${businessId}/bookings/${timelineBookingId}/timeline`;await request(app.getHttpServer()).get(endpoint).expect(401);await request(app.getHttpServer()).get(endpoint).set('Authorization','Bearer invalid').expect(401);const token=await bearer();await request(app.getHttpServer()).get(endpoint).set('Authorization',`Bearer ${token}`).expect(403);memberships=[membership(businessId,MembershipRole.VIEWER)];await request(app.getHttpServer()).get(endpoint).set('Authorization',`Bearer ${token}`).expect(200);await request(app.getHttpServer()).get(`/api/businesses/${otherBusinessId}/bookings/${timelineBookingId}/timeline`).set('Authorization',`Bearer ${token}`).expect(403);userStatus=UserStatus.DISABLED;await request(app.getHttpServer()).get(endpoint).set('Authorization',`Bearer ${token}`).expect(401);});

  it('mantiene Login, Refresh y Logout libres de Bearer', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({}).expect(400);
    await request(app.getHttpServer()).post('/api/auth/logout').send({}).expect(400);
  });
});
