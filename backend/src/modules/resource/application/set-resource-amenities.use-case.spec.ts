import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Amenity } from '../domain/amenity.entity';
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { AmenitiesNotFoundError, InactiveAmenitiesError, InvalidResourceAmenitiesInputError, SetResourceAmenitiesUseCase } from './set-resource-amenities.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const amenityId = '33333333-3333-4333-8333-333333333333';
const amenityIdB = '44444444-4444-4444-8444-444444444444';
const makeBusiness = (): Business => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
const makeResource = (): Resource => Resource.create({ id: resourceId, businessId, name: 'Cabana', internalCode: 'CAB', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
const makeAmenity = (active = true): Amenity => Amenity.create({ id: amenityId, code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
const makeAmenityB = (active = true): Amenity => Amenity.create({ id: amenityIdB, code: 'TV', name: 'TV', category: 'ENTERTAINMENT', active, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });

describe('SetResourceAmenitiesUseCase', () => {
  const setup = (amenities = [makeAmenity()]): { useCase: SetResourceAmenitiesUseCase; replace: jest.Mock } => {
    const replace = jest.fn().mockResolvedValue(undefined);
    return { useCase: new SetResourceAmenitiesUseCase({ findById: jest.fn().mockResolvedValue(makeBusiness()), create: jest.fn(), list: jest.fn(), update: jest.fn() }, { findByIdAndBusinessId: jest.fn().mockResolvedValue(makeResource()), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() }, { listActive: jest.fn(), findManyByIds: jest.fn().mockResolvedValue(amenities) }, { replace, listByResourceId: jest.fn().mockResolvedValue(amenities) }), replace };
  };

  it('replaces the collection and returns the resource with ordered public amenities', async () => {
    const { useCase, replace } = setup();
    const resource = await useCase.execute({ businessId, resourceId, amenityIds: [amenityId] });
    expect(replace).toHaveBeenCalledWith(resourceId, [amenityId]);
    expect(resource.amenities).toHaveLength(1);
  });

  it('accepts an empty array to remove all amenities', async () => {
    const { useCase, replace } = setup([]);
    await useCase.execute({ businessId, resourceId, amenityIds: [] });
    expect(replace).toHaveBeenCalledWith(resourceId, []);
  });

  it.each([
    [{ businessId: '', resourceId, amenityIds: [] }, 'El identificador del negocio no es válido.'],
    [{ businessId, resourceId: '', amenityIds: [] }, 'El identificador del recurso no es válido.'],
    [{ businessId, resourceId, amenityIds: undefined as unknown as string[] }, 'La lista de amenities es obligatoria.'],
    [{ businessId, resourceId, amenityIds: [amenityId, 'invalid', amenityIdB] }, 'Los identificadores de amenities deben ser UUID válidos.'],
    [{ businessId, resourceId, amenityIds: [amenityId, amenityIdB, amenityId] }, 'La lista de amenities no puede contener duplicados.'],
  ])('rejects invalid input before consulting dependencies', async (input, message) => {
    const { useCase, replace } = setup();
    await expect(useCase.execute(input)).rejects.toThrow(message);
    expect(replace).not.toHaveBeenCalled();
  });

  it('uses exact ids for multiple active amenities and propagates persistence failures', async () => {
    const replace = jest.fn().mockRejectedValue(new Error('replace failed'));
    const findManyByIds = jest.fn().mockResolvedValue([makeAmenity(), makeAmenityB()]);
    const useCase = new SetResourceAmenitiesUseCase({ findById: jest.fn().mockResolvedValue(makeBusiness()), create: jest.fn(), list: jest.fn(), update: jest.fn() }, { findByIdAndBusinessId: jest.fn().mockResolvedValue(makeResource()), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() }, { listActive: jest.fn(), findManyByIds }, { replace, listByResourceId: jest.fn() });
    await expect(useCase.execute({ businessId, resourceId, amenityIds: [amenityId, amenityIdB] })).rejects.toThrow('replace failed');
    expect(findManyByIds).toHaveBeenCalledWith([amenityId, amenityIdB]);
    expect(replace).toHaveBeenCalledWith(resourceId, [amenityId, amenityIdB]);
  });

  it('rejects partial result and mixed inactive amenities without reloading', async () => {
    const partial = setup([makeAmenity()]);
    await expect(partial.useCase.execute({ businessId, resourceId, amenityIds: [amenityId, amenityIdB] })).rejects.toThrow('Una o más amenities no existen.');
    const inactive = setup([makeAmenity(), makeAmenityB(false)]);
    await expect(inactive.useCase.execute({ businessId, resourceId, amenityIds: [amenityId, amenityIdB] })).rejects.toThrow('Una o más amenities están inactivas.');
    expect(partial.replace).not.toHaveBeenCalled(); expect(inactive.replace).not.toHaveBeenCalled();
  });

  it('rejects invalid or duplicate amenity ids before persisting', async () => {
    const { useCase, replace } = setup();
    await expect(useCase.execute({ businessId, resourceId, amenityIds: ['invalid'] })).rejects.toThrow(InvalidResourceAmenitiesInputError);
    await expect(useCase.execute({ businessId, resourceId, amenityIds: [amenityId, amenityId] })).rejects.toThrow('La lista de amenities no puede contener duplicados.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('rejects missing and inactive amenities without replacing', async () => {
    const missing = setup([]);
    await expect(missing.useCase.execute({ businessId, resourceId, amenityIds: [amenityId] })).rejects.toThrow(AmenitiesNotFoundError);
    expect(missing.replace).not.toHaveBeenCalled();
    const inactive = setup([makeAmenity(false)]);
    await expect(inactive.useCase.execute({ businessId, resourceId, amenityIds: [amenityId] })).rejects.toThrow(InactiveAmenitiesError);
    expect(inactive.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['business inexistente', null, makeResource(), [makeAmenity()], 'El negocio no existe.'],
    ['business archivado', Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ARCHIVED, createdAt: new Date(), updatedAt: new Date() }), makeResource(), [makeAmenity()], 'El negocio está archivado.'],
    ['resource inexistente', makeBusiness(), null, [makeAmenity()], 'El recurso no existe.'],
    ['resource archivado', makeBusiness(), Resource.create({ id: resourceId, businessId, name: 'Cabana', internalCode: 'CAB', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ARCHIVED, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }), [makeAmenity()], 'El recurso está archivado.'],
  ])('rejects %s with its exact message', async (_caseName, business, resource, amenities, message) => {
    const replace = jest.fn();
    const useCase = new SetResourceAmenitiesUseCase({ findById: jest.fn().mockResolvedValue(business), create: jest.fn(), list: jest.fn(), update: jest.fn() }, { findByIdAndBusinessId: jest.fn().mockResolvedValue(resource), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() }, { listActive: jest.fn(), findManyByIds: jest.fn().mockResolvedValue(amenities) }, { replace, listByResourceId: jest.fn() });
    await expect(useCase.execute({ businessId, resourceId, amenityIds: [amenityId] })).rejects.toThrow(message);
    expect(replace).not.toHaveBeenCalled();
  });
});
