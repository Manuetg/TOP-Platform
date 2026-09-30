import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { RESOURCE_REPOSITORY } from '../../src/modules/resource/resource.contract';
import { CONTACT_LOOKUP } from '../../src/modules/contact/contact.contract';
import { BOOKING_REPOSITORY, BookingStatus } from '../../src/modules/booking/booking.contract';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BOOKING_CONFIRMATION_TRANSACTION, type BookingConfirmationSnapshotData } from '../../src/modules/booking-lifecycle/booking-confirmation.contract';
import { AVAILABILITY_OVERBOOKING_VALIDATOR } from '../../src/modules/availability/availability.contract';
import { RATE_PLAN_REPOSITORY } from '../../src/modules/pricing/domain/rate-plan.repository';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const foreignId = '55555555-5555-4555-8555-555555555555';
const item = { resourceId, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 450000, overrideReason: 'Acuerdo directo' };
const endpoint = `/api/businesses/${businessId}/bookings/${bookingId}/confirm`;

describe('Confirmación de precio manual HTTP con autorización real', () => {
  let app: INestApplication; let token: string; let role: MembershipRole;
  let stored: BookingConfirmationSnapshotData | null; let actor: string | null;
  let plans: object[]; let businessStatus: 'ACTIVE' | 'ARCHIVED'; let resourceStatus: 'ACTIVE' | 'ARCHIVED' | 'OUT_OF_SERVICE'; let contactActive: boolean;
  let bookingResourceId: string; let checkInDate: Date; let checkOutDate: Date;
  const listPlans = jest.fn(() => Promise.resolve(plans));
  beforeAll(async () => {
    const secret = 'manual-pricing-e2e-secret';
    token = await new JwtService().signAsync({ sub: userId }, { secret });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JwtAccessTokenIssuer).useFactory({ factory: () => new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret })) })
      .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: () => Promise.resolve({ id: userId, status: 'ACTIVE' }) })
      .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserAndBusiness: (_user: string, owner: string) => Promise.resolve(owner === businessId ? { role } : null) })
      .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: () => Promise.resolve({ id: businessId, status: businessStatus, currency: 'PYG' }) })
      .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(id === resourceId && owner === businessId ? { status: resourceStatus } : null) })
      .overrideProvider(CONTACT_LOOKUP).useValue({ findByIdAndBusinessId: () => Promise.resolve(contactActive ? { id: userId } : null) })
      .overrideProvider(RATE_PLAN_REPOSITORY).useValue({ listByBusinessId: listPlans })
      .overrideProvider(AVAILABILITY_OVERBOOKING_VALIDATOR).useValue({ validate: () => Promise.resolve({ valid: true, conflicts: [] }) })
      .overrideProvider(BOOKING_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(id === bookingId && owner === businessId ? Booking.create({ id: bookingId, businessId, status: stored ? BookingStatus.CONFIRMED : BookingStatus.PENDING, contactId: userId, resourceIds: [bookingResourceId], checkInDate, checkOutDate, adults: 2, children: 0, notes: null, createdAt: new Date(), updatedAt: new Date() }) : null) })
      .overrideProvider(BOOKING_CONFIRMATION_TRANSACTION).useValue({ confirm: async (input: { actorUserId: string | null; prepare: () => Promise<BookingConfirmationSnapshotData> }) => { const snapshot = await input.prepare(); stored = snapshot; actor = input.actorUserId; return 'CONFIRMED'; } })
      .compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { role = MembershipRole.OWNER; stored = null; actor = null; plans = []; businessStatus = 'ACTIVE'; resourceStatus = 'ACTIVE'; contactActive = true; bookingResourceId = resourceId; checkInDate = new Date('2026-09-24'); checkOutDate = new Date('2026-09-26'); listPlans.mockClear(); });
  const confirm = (pricing = item, url = endpoint) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ pricing: [pricing] });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN])('autoriza %s y conserva origen, motivo y actor', async (allowedRole) => {
    role = allowedRole; await confirm().expect(200).expect(({ body }) => expect(body.status).toBe('CONFIRMED'));
    expect(stored).toMatchObject({ currency: 'PYG', totalAmountMinor: 450000, items: [{ ...item, ratePlanId: null, suggestedAmountMinor: null, adjustmentAmountMinor: null, nights: 2, breakdown: [] }] }); expect(actor).toBe(userId);
  });
  it.each([MembershipRole.RECEPTIONIST, MembershipRole.VIEWER])('deniega %s sin persistir', async (deniedRole) => {
    role = deniedRole; await confirm().expect(403); expect(stored).toBeNull();
    await request(app.getHttpServer()).post(endpoint).set('Authorization', `Bearer ${token}`).send({ pricing: [{ resourceId, pricingMode: 'MANUAL_NO_RATE_PLAN' }] }).expect(403);
  });
  it('rechaza sin autenticar y a otro Business', async () => {
    await request(app.getHttpServer()).post(endpoint).send({ pricing: [item] }).expect(401);
    await confirm(item, endpoint.replace(businessId, foreignId)).expect(403); expect(stored).toBeNull();
  });
  it('revalida Business, Resource y Contact operativos', async () => {
    businessStatus = 'ARCHIVED'; await confirm().expect(409); expect(stored).toBeNull();
    businessStatus = 'ACTIVE'; resourceStatus = 'ARCHIVED'; await confirm().expect(409); expect(stored).toBeNull();
    resourceStatus = 'OUT_OF_SERVICE'; await confirm().expect(409); expect(stored).toBeNull();
    resourceStatus = 'ACTIVE'; contactActive = false; await confirm().expect(404); expect(stored).toBeNull();
  });
  it('oculta un Resource de otro Business al confirmar', async () => {
    bookingResourceId = foreignId;
    await confirm({ ...item, resourceId: foreignId }).expect(404);
    expect(stored).toBeNull();
  });
  it('aplica el límite de 365 noches al precio manual', async () => {
    checkInDate = new Date('2026-01-01'); checkOutDate = new Date('2027-01-01');
    await confirm().expect(200); expect(stored?.items[0]).toMatchObject({ nights: 365 });
    stored = null; checkOutDate = new Date('2027-01-02');
    await confirm().expect(400); expect(stored).toBeNull();
  });
  it.each([0, 1, 3])('confirma manual sin consultar el catálogo con %i planes', async (count) => {
    plans = Array.from({ length: count }, () => ({ status: 'ACTIVE', resources: [{ id: resourceId }], validFrom: null, validTo: null }));
    await confirm().expect(200);
    expect(stored).toMatchObject({ currency: 'PYG', totalAmountMinor: 450000, items: [{ ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN' }] });
    expect(listPlans).not.toHaveBeenCalled();
  });
  it.each([
    { ...item, agreedAmountMinor: undefined }, { ...item, agreedAmountMinor: null }, { ...item, agreedAmountMinor: -1 },
    { ...item, agreedAmountMinor: 0.5 }, { ...item, agreedAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...item, overrideReason: undefined }, { ...item, overrideReason: null }, { ...item, overrideReason: ' ' }, { ...item, overrideReason: 'x'.repeat(501) },
    { ...item, ratePlanId: resourceId }, { ...item, ratePlanId: null }, { ...item, pricingMode: null },
    { ...item, pricingMode: 'MANUAL' }, { ...item, pricingMode: undefined }, { ...item, resourceId: foreignId },
  ])('rechaza payload inválido %# sin confirmar ni guardar Snapshot', async (pricing) => {
    await request(app.getHttpServer()).post(endpoint).set('Authorization', `Bearer ${token}`).send({ pricing: [pricing] }).expect(400); expect(stored).toBeNull();
  });
  it('acepta monto cero con motivo', async () => { await confirm({ ...item, agreedAmountMinor: 0 }).expect(200); expect(stored).toMatchObject({ totalAmountMinor: 0 }); });
});
