import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type { BusinessRepository } from '../../business/domain/business.repository';
import { RatePlan } from '../domain/rate-plan.entity';
import type { RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { SeasonalRate } from '../domain/seasonal-rate.entity';
import type { SeasonalRateRepository } from '../domain/seasonal-rate.repository';
import {
  InvalidSeasonalRateInputError,
  SeasonalRateBusinessArchivedError,
  SeasonalRateBusinessNotFoundError,
  SeasonalRateOverlapError,
  SeasonalRatePlanArchivedError,
  SeasonalRatePlanNotFoundError,
  SeasonalRateValidityConflictError,
} from './seasonal-rate.errors';
import { CreateSeasonalRateUseCase } from './create-seasonal-rate.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const ratePlanId = '22222222-2222-4222-8222-222222222222';

const business = (): Business =>
  Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status: BusinessStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const ratePlan = (): RatePlan =>
  RatePlan.create({
    id: ratePlanId,
    businessId,
    name: 'Estacional',
    description: null,
    baseNightlyAmountMinor: 450000,
    currency: 'PYG',
    status: RatePlanStatus.ACTIVE,
    validFrom: null,
    validTo: null,
    resources: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const planWith = (
  status = RatePlanStatus.ACTIVE,
  validFrom: string | null = null,
  validTo: string | null = null,
): RatePlan =>
  RatePlan.create({
    id: ratePlanId,
    businessId,
    name: 'Estacional',
    description: null,
    baseNightlyAmountMinor: 450000,
    currency: 'PYG',
    status,
    validFrom,
    validTo,
    resources: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const seasonalRate = (): SeasonalRate =>
  SeasonalRate.create({
    id: '33333333-3333-4333-8333-333333333333',
    ratePlanId,
    name: 'Verano',
    amountMinor: 650000,
    startDate: '2026-02-28',
    endDate: '2026-03-10',
    currency: 'PYG',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

describe('CreateSeasonalRateUseCase date validation', () => {
  const findBusiness: jest.MockedFunction<BusinessRepository['findById']> = jest.fn();
  const findRatePlan: jest.MockedFunction<
    RatePlanRepository['findByIdAndBusinessId']
  > = jest.fn();
  const create: jest.MockedFunction<SeasonalRateRepository['create']> = jest.fn();
  const hasOverlap: jest.MockedFunction<
    SeasonalRateRepository['hasOverlap']
  > = jest.fn();
  const businesses: BusinessRepository = {
    findById: findBusiness,
    create: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
  };
  const plans: RatePlanRepository = {
    create: jest.fn(),
    findByIdAndBusinessId: findRatePlan,
    update: jest.fn(),
  };
  const seasons: SeasonalRateRepository = {
    create,
    listByRatePlanId: jest.fn(),
    hasOverlap,
    hasOutsideValidity: jest.fn(),
  };
  const subject = new CreateSeasonalRateUseCase(businesses, plans, seasons);
  const input = {
    businessId,
    ratePlanId,
    name: 'Verano',
    amountMinor: 650000,
    startDate: '2026-02-28',
    endDate: '2026-03-10',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findRatePlan.mockResolvedValue(ratePlan());
    hasOverlap.mockResolvedValue(false);
    create.mockResolvedValue(seasonalRate());
  });

  it.each([
    ['2026-02-28', '2026-03-10'],
    ['2028-02-29', '2028-03-01'],
  ])('accepts a real start date: %s', async (startDate, endDate) => {
    await expect(subject.execute({ ...input, startDate, endDate })).resolves.toEqual(
      seasonalRate(),
    );

    expect(findBusiness).toHaveBeenCalledWith(businessId);
    expect(findRatePlan).toHaveBeenCalledWith(ratePlanId, businessId);
    expect(hasOverlap).toHaveBeenCalledWith(ratePlanId, startDate, endDate);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ startDate, endDate }),
    );
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026/12/20',
    '20-12-2026',
    'texto',
    '',
  ])('rejects an invalid start date: %s', async (startDate) => {
    await expect(subject.execute({ ...input, startDate })).rejects.toThrow(
      new InvalidSeasonalRateInputError('La fecha de inicio es inválida.'),
    );

    expect(findBusiness).not.toHaveBeenCalled();
    expect(findRatePlan).not.toHaveBeenCalled();
    expect(hasOverlap).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', '2026-04-31'])('rejects an invalid end date: %s', async (endDate) => {
    await expect(subject.execute({ ...input, endDate })).rejects.toThrow(
      new InvalidSeasonalRateInputError('La fecha de fin es inválida.'),
    );

    expect(findBusiness).not.toHaveBeenCalled();
    expect(findRatePlan).not.toHaveBeenCalled();
    expect(hasOverlap).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('validates identifiers and input fields before dependencies', async () => {
    await expect(subject.execute({ ...input, businessId: 'invalid' })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El identificador del negocio no es válido.'),
    );
    await expect(subject.execute({ ...input, ratePlanId: 'invalid' })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El identificador de la tarifa no es válido.'),
    );
    await expect(subject.execute({ ...input, businessId: `${businessId}suffix` })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El identificador del negocio no es válido.'),
    );
    await expect(subject.execute({ ...input, ratePlanId: `${ratePlanId}suffix` })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El identificador de la tarifa no es válido.'),
    );
    await expect(subject.execute({ ...input, name: undefined })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El nombre de la temporada es obligatorio.'),
    );
    await expect(subject.execute({ ...input, name: ' ' })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El nombre de la temporada debe tener entre 2 y 120 caracteres.'),
    );
    await expect(subject.execute({ ...input, name: 'x'.repeat(121) })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El nombre de la temporada debe tener entre 2 y 120 caracteres.'),
    );
    await expect(subject.execute({ ...input, amountMinor: 0 })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El importe de temporada debe ser un entero positivo válido.'),
    );
    await expect(subject.execute({ ...input, amountMinor: 1.5 })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El importe de temporada debe ser un entero positivo válido.'),
    );
    await expect(subject.execute({ ...input, amountMinor: 2147483648 })).rejects.toThrow(
      new InvalidSeasonalRateInputError('El importe de temporada debe ser un entero positivo válido.'),
    );
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findRatePlan).not.toHaveBeenCalled();
    expect(hasOverlap).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes the name and accepts the exact field boundaries', async () => {
    await expect(
      subject.execute({ ...input, name: ` ${'x'.repeat(120)} `, amountMinor: 1 }),
    ).resolves.toEqual(seasonalRate());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'x'.repeat(120), amountMinor: 1 }),
    );
  });

  it.each([0, -1, 1.5, '1', true, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid amount: %p',
    async (amountMinor) => {
      await expect(subject.execute({ ...input, amountMinor })).rejects.toThrow(
        new InvalidSeasonalRateInputError('El importe de temporada debe ser un entero positivo válido.'),
      );
      expect(findBusiness).not.toHaveBeenCalled();
    },
  );

  it('rejects equality, inversion and non-string dates before dependencies', async () => {
    await expect(subject.execute({ ...input, startDate: '2026-03-10', endDate: '2026-03-10' })).rejects.toThrow(
      new InvalidSeasonalRateInputError('La fecha de inicio debe ser anterior a la fecha de fin.'),
    );
    await expect(subject.execute({ ...input, startDate: '2026-03-11', endDate: '2026-03-10' })).rejects.toThrow(
      new InvalidSeasonalRateInputError('La fecha de inicio debe ser anterior a la fecha de fin.'),
    );
    await expect(subject.execute({ ...input, startDate: 20260310 })).rejects.toThrow(
      new InvalidSeasonalRateInputError('La fecha de inicio es inválida.'),
    );
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findRatePlan).not.toHaveBeenCalled();
  });

  it('rejects missing or archived Business before the RatePlan lookup', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toThrow(
      new SeasonalRateBusinessNotFoundError('El negocio no existe.'),
    );
    expect(findRatePlan).not.toHaveBeenCalled();

    findBusiness.mockResolvedValueOnce(
      Business.create({
        id: businessId,
        businessNumber: null,
        name: 'TOP',
        legalName: null,
        taxId: null,
        timezone: 'America/Asuncion',
        currency: 'PYG',
        status: BusinessStatus.ARCHIVED,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    await expect(subject.execute(input)).rejects.toThrow(
      new SeasonalRateBusinessArchivedError('El negocio está archivado.'),
    );
    expect(findRatePlan).not.toHaveBeenCalled();
  });

  it('rejects missing, cross-tenant or archived RatePlans', async () => {
    findRatePlan.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toThrow(
      new SeasonalRatePlanNotFoundError('La tarifa no existe.'),
    );
    expect(hasOverlap).not.toHaveBeenCalled();

    findRatePlan.mockResolvedValueOnce(null);
    await expect(subject.execute({ ...input, ratePlanId: '44444444-4444-4444-8444-444444444444' })).rejects.toThrow(
      new SeasonalRatePlanNotFoundError('La tarifa no existe.'),
    );

    findRatePlan.mockResolvedValueOnce(planWith(RatePlanStatus.ARCHIVED));
    await expect(subject.execute(input)).rejects.toThrow(
      new SeasonalRatePlanArchivedError('La tarifa está archivada.'),
    );
    expect(hasOverlap).not.toHaveBeenCalled();
  });

  it('enforces containment while allowing exact validity boundaries', async () => {
    findRatePlan.mockResolvedValueOnce(planWith(RatePlanStatus.ACTIVE, '2026-12-20', '2027-01-06'));
    await expect(subject.execute({ ...input, startDate: '2026-12-20', endDate: '2027-01-06' })).resolves.toEqual(seasonalRate());

    findRatePlan.mockResolvedValueOnce(planWith(RatePlanStatus.ACTIVE, '2026-12-20', '2027-01-06'));
    await expect(subject.execute({ ...input, startDate: '2026-12-19', endDate: '2026-12-21' })).rejects.toThrow(
      new SeasonalRateValidityConflictError('La temporada debe estar dentro de la vigencia de la tarifa.'),
    );

    findRatePlan.mockResolvedValueOnce(planWith(RatePlanStatus.ACTIVE, '2026-12-20', '2027-01-06'));
    await expect(subject.execute({ ...input, startDate: '2027-01-01', endDate: '2027-01-07' })).rejects.toThrow(
      new SeasonalRateValidityConflictError('La temporada debe estar dentro de la vigencia de la tarifa.'),
    );
  });

  it('allows contiguous seasons, rejects overlaps and passes exact persistence data', async () => {
    await expect(subject.execute({ ...input, name: ' Verano ', startDate: '2026-12-20', endDate: '2027-01-06' })).resolves.toEqual(seasonalRate());
    expect(hasOverlap).toHaveBeenCalledWith(ratePlanId, '2026-12-20', '2027-01-06');
    expect(create).toHaveBeenCalledWith({
      ratePlanId,
      name: 'Verano',
      amountMinor: 650000,
      startDate: '2026-12-20',
      endDate: '2027-01-06',
      currency: 'PYG',
    });

    hasOverlap.mockResolvedValueOnce(true);
    await expect(subject.execute(input)).rejects.toThrow(
      new SeasonalRateOverlapError('La temporada se superpone con una existente.'),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('propagates unexpected repository failures', async () => {
    const failure = new Error('database unavailable');
    hasOverlap.mockRejectedValueOnce(failure);
    await expect(subject.execute(input)).rejects.toBe(failure);

    hasOverlap.mockResolvedValueOnce(false);
    create.mockRejectedValueOnce(failure);
    await expect(subject.execute(input)).rejects.toBe(failure);
  });
});
