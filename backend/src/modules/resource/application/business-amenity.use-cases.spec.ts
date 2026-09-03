import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Amenity } from '../domain/amenity.entity';
import { BusinessAmenityBusinessArchivedError, BusinessAmenityBusinessNotFoundError, CreateBusinessAmenityUseCase, InvalidBusinessAmenityInputError } from './create-business-amenity.use-case';
import { ListBusinessAmenitiesUseCase } from './list-business-amenities.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const otherBusinessId = '22222222-2222-4222-8222-222222222222';
const business = (status = BusinessStatus.ACTIVE) => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const amenity = (id: string, owner: string | null) => Amenity.create({ id, businessId: owner, code: `CUSTOM_${id}`, name: 'Muelle privado', category: 'OUTDOOR', active: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });

describe('Business amenities', () => {
  it('creates an active custom amenity with normalized name and opaque code', async () => {
    const create = jest.fn((value: Amenity) => Promise.resolve(value));
    const useCase = new CreateBusinessAmenityUseCase({ findById: jest.fn().mockResolvedValue(business()) } as never, { create });
    const result = await useCase.execute({ businessId, name: ' Muelle privado ', category: 'OUTDOOR' });
    expect(result).toMatchObject({ businessId, name: 'Muelle privado', active: true, sortOrder: 0, scope: 'BUSINESS' });
    expect(result.code).toMatch(/^CUSTOM_[0-9a-f]{32}$/);
    expect(create).toHaveBeenCalledWith(result);
  });

  it.each([{ name: '', category: 'OUTDOOR' }, { name: 'x'.repeat(121), category: 'OUTDOOR' }, { name: 'Muelle', category: 'UNKNOWN' }])('rejects invalid custom amenity input before persisting', async (input) => {
    const create = jest.fn();
    const useCase = new CreateBusinessAmenityUseCase({ findById: jest.fn() } as never, { create });
    await expect(useCase.execute({ businessId, ...input })).rejects.toBeInstanceOf(InvalidBusinessAmenityInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects missing and archived businesses', async () => {
    const create = jest.fn();
    const missing = new CreateBusinessAmenityUseCase({ findById: jest.fn().mockResolvedValue(null) } as never, { create });
    await expect(missing.execute({ businessId, name: 'Muelle', category: 'OUTDOOR' })).rejects.toBeInstanceOf(BusinessAmenityBusinessNotFoundError);
    const archived = new CreateBusinessAmenityUseCase({ findById: jest.fn().mockResolvedValue(business(BusinessStatus.ARCHIVED)) } as never, { create });
    await expect(archived.execute({ businessId, name: 'Muelle', category: 'OUTDOOR' })).rejects.toBeInstanceOf(BusinessAmenityBusinessArchivedError);
  });

  it('rejects listing amenities for an archived business', async () => {
    const listActiveForBusiness = jest.fn();
    const useCase = new ListBusinessAmenitiesUseCase(
      { findById: jest.fn().mockResolvedValue(business(BusinessStatus.ARCHIVED)) } as never,
      { listActiveForBusiness },
    );

    await expect(useCase.execute(businessId)).rejects.toBeInstanceOf(
      BusinessAmenityBusinessArchivedError,
    );

    expect(listActiveForBusiness).not.toHaveBeenCalled();
  });
  it('lists global and only same-business custom active amenities', async () => {
    const listActiveForBusiness = jest.fn().mockResolvedValue([amenity('33333333-3333-4333-8333-333333333333', null), amenity('44444444-4444-4444-8444-444444444444', businessId)]);
    const useCase = new ListBusinessAmenitiesUseCase({ findById: jest.fn().mockResolvedValue(business()) } as never, { listActiveForBusiness });
    await expect(useCase.execute(businessId)).resolves.toHaveLength(2);
    expect(listActiveForBusiness).toHaveBeenCalledWith(businessId);
    expect((await useCase.execute(businessId)).some((item) => item.businessId === otherBusinessId)).toBe(false);
  });
});
