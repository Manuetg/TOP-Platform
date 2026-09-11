import { BusinessStatus } from '../../business/business.contract';
import { Business } from '../../business/domain/business.entity';
import type { BusinessRepository } from '../../business/domain/business.repository';
import { Resource } from '../../resource/domain/resource.entity';
import type { ResourceRepository } from '../../resource/domain/resource.repository';
import { ResourceStatus } from '../../resource/domain/resource-status.enum';
import { RatePlan } from '../domain/rate-plan.entity';
import type { RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import {
  InvalidListRatePlansInputError,
  ListRatePlansBusinessArchivedError,
  ListRatePlansBusinessNotFoundError,
  ListRatePlansResourceNotFoundError,
  ListRatePlansResourceUnavailableError,
  ListRatePlansUseCase,
} from './list-rate-plans.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';

function business(status = BusinessStatus.ACTIVE): Business {
  return Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
}

function resource(status = ResourceStatus.ACTIVE, owner = businessId): Resource {
  return Resource.create({ id: resourceId, businessId: owner, name: 'Suite', internalCode: 'SUITE', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
}

function plan(input: Partial<{
  id: string;
  businessId: string;
  name: string;
  status: RatePlanStatus;
  validFrom: string | null;
  validTo: string | null;
  assigned: boolean;
}> = {}): RatePlan {
  return RatePlan.create({
    id: input.id ?? '33333333-3333-4333-8333-333333333333',
    businessId: input.businessId ?? businessId,
    name: input.name ?? 'Estándar',
    description: null,
    baseNightlyAmountMinor: 450_000,
    currency: 'PYG',
    status: input.status ?? RatePlanStatus.ACTIVE,
    validFrom: input.validFrom === undefined ? '2026-09-01' : input.validFrom,
    validTo: input.validTo === undefined ? '2026-10-01' : input.validTo,
    resources: input.assigned === false ? [] : [{ id: resourceId, name: 'Suite', internalCode: 'SUITE' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ListRatePlansUseCase', () => {
  const findBusiness = jest.fn<ReturnType<BusinessRepository['findById']>, Parameters<BusinessRepository['findById']>>();
  const findResource = jest.fn<ReturnType<ResourceRepository['findByIdAndBusinessId']>, Parameters<ResourceRepository['findByIdAndBusinessId']>>();
  const list = jest.fn<ReturnType<RatePlanRepository['listByBusinessId']>, Parameters<RatePlanRepository['listByBusinessId']>>();
  const subject = new ListRatePlansUseCase(
    { create: jest.fn(), findById: findBusiness, list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource },
    { create: jest.fn(), findByIdAndBusinessId: jest.fn(), listByBusinessId: list, update: jest.fn() },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findResource.mockResolvedValue(resource());
    list.mockResolvedValue([plan()]);
  });

  it('lists the complete tenant-scoped catalog in repository order', async () => {
    const plans = [
      plan({ id: '33333333-3333-4333-8333-333333333331', name: 'A', status: RatePlanStatus.ACTIVE }),
      plan({ id: '33333333-3333-4333-8333-333333333332', name: 'B', status: RatePlanStatus.ARCHIVED }),
    ];
    list.mockResolvedValueOnce(plans);
    await expect(subject.execute({ businessId })).resolves.toEqual(plans);
    expect(list).toHaveBeenCalledWith(businessId);
    expect(findResource).not.toHaveBeenCalled();
  });

  it('allows an archived Business and an empty general catalog', async () => {
    findBusiness.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    list.mockResolvedValueOnce([]);
    await expect(subject.execute({ businessId })).resolves.toEqual([]);
  });

  it('rejects an invalid or missing Business', async () => {
    await expect(subject.execute({ businessId: 'invalid' })).rejects.toBeInstanceOf(InvalidListRatePlansInputError);
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute({ businessId })).rejects.toBeInstanceOf(ListRatePlansBusinessNotFoundError);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    { resourceId },
    { checkIn: '2026-09-10' },
    { checkOut: '2026-09-12' },
    { resourceId, checkIn: '2026-09-10' },
    { resourceId, checkOut: '2026-09-12' },
    { checkIn: '2026-09-10', checkOut: '2026-09-12' },
  ])('rejects a partial selection query', async (query) => {
    await expect(subject.execute({ businessId, ...query })).rejects.toBeInstanceOf(InvalidListRatePlansInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', '2026-09-10', '2026-09-12'],
    [resourceId, '2026-02-30', '2026-09-12'],
    [resourceId, '2026-09-10', '2026-02-30'],
    [resourceId, '2026-09-12', '2026-09-12'],
    [resourceId, '2026-09-13', '2026-09-12'],
    [resourceId, '2026-01-01', '2027-01-02'],
  ])('rejects invalid selection values %#', async (selectedResource, checkIn, checkOut) => {
    await expect(subject.execute({ businessId, resourceId: selectedResource, checkIn, checkOut })).rejects.toBeInstanceOf(InvalidListRatePlansInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it('rejects selection for an archived Business', async () => {
    findBusiness.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-09-10', checkOut: '2026-09-12' })).rejects.toBeInstanceOf(ListRatePlansBusinessArchivedError);
    expect(findResource).not.toHaveBeenCalled();
  });

  it('hides a missing or cross-tenant Resource', async () => {
    findResource.mockResolvedValueOnce(null);
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-09-10', checkOut: '2026-09-12' })).rejects.toBeInstanceOf(ListRatePlansResourceNotFoundError);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([ResourceStatus.OUT_OF_SERVICE, ResourceStatus.ARCHIVED])('rejects an unavailable Resource in %s', async (status) => {
    findResource.mockResolvedValueOnce(resource(status));
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-09-10', checkOut: '2026-09-12' })).rejects.toBeInstanceOf(ListRatePlansResourceUnavailableError);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns only active, assigned Rate Plans that cover the complete stay', async () => {
    const selectable = plan({ id: '33333333-3333-4333-8333-333333333331' });
    list.mockResolvedValueOnce([
      selectable,
      plan({ id: '33333333-3333-4333-8333-333333333332', status: RatePlanStatus.ARCHIVED }),
      plan({ id: '33333333-3333-4333-8333-333333333333', assigned: false }),
      plan({ id: '33333333-3333-4333-8333-333333333334', validFrom: '2026-09-11' }),
      plan({ id: '33333333-3333-4333-8333-333333333335', validTo: '2026-09-11' }),
    ]);
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-09-10', checkOut: '2026-09-12' })).resolves.toEqual([selectable]);
  });

  it('accepts null validity and exact validity boundaries', async () => {
    const open = plan({ id: '33333333-3333-4333-8333-333333333331', validFrom: null, validTo: null });
    const exact = plan({ id: '33333333-3333-4333-8333-333333333332', validFrom: '2026-09-10', validTo: '2026-09-12' });
    list.mockResolvedValueOnce([open, exact]);
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-09-10', checkOut: '2026-09-12' })).resolves.toEqual([open, exact]);
    expect(findResource).toHaveBeenCalledWith(resourceId, businessId);
  });

  it('accepts a stay of exactly 365 nights', async () => {
    list.mockResolvedValueOnce([plan({ validFrom: null, validTo: null })]);
    await expect(subject.execute({ businessId, resourceId, checkIn: '2026-01-01', checkOut: '2027-01-01' })).resolves.toHaveLength(1);
  });
});
