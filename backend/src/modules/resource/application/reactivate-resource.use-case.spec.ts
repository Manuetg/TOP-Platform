import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/business.contract';
import { Resource } from '../domain/resource.entity';
import { type ResourceRepository } from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import {
  InvalidBusinessIdError,
  InvalidResourceIdError,
  ResourceBusinessNotFoundError,
  ResourceNotFoundError,
} from './get-resource.use-case';
import { ReactivateResourceUseCase } from './reactivate-resource.use-case';
import { ResourceArchivedError, ResourceBusinessArchivedError } from './update-resource.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const makeBusiness = (status = BusinessStatus.ACTIVE): Business => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });
const makeResource = (status = ResourceStatus.OUT_OF_SERVICE): Resource => Resource.create({ id: resourceId, businessId, name: 'Cabana', internalCode: 'CAB', description: 'Vista', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 3, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });

describe('ReactivateResourceUseCase', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const update = jest.fn();
  const resources: ResourceRepository = { findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), findByIdAndBusinessId: findResource, update };
  const useCase = new ReactivateResourceUseCase({ findById: findBusiness } as never, resources);

  beforeEach(() => jest.clearAllMocks());

  it('cambia OUT_OF_SERVICE a ACTIVE y preserva los demás datos', async () => {
    const resource = makeResource();
    findBusiness.mockResolvedValue(makeBusiness());
    findResource.mockResolvedValue(resource);
    update.mockImplementation((value: Resource) => Promise.resolve(value));

    const result = await useCase.execute({ businessId, resourceId });

    expect(result).toMatchObject({ id: resourceId, businessId, name: 'Cabana', internalCode: 'CAB', capacityMaximum: 4, status: ResourceStatus.ACTIVE, createdAt: resource.createdAt });
    expect(result.updatedAt.getTime()).toBeGreaterThan(resource.updatedAt.getTime());
    expect(update).toHaveBeenCalledWith(result);
  });

  it('es idempotente para ACTIVE sin persistir ni cambiar timestamp', async () => {
    const resource = makeResource(ResourceStatus.ACTIVE);
    findBusiness.mockResolvedValue(makeBusiness());
    findResource.mockResolvedValue(resource);

    await expect(useCase.execute({ businessId, resourceId })).resolves.toBe(resource);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [{ businessId: 'invalido', resourceId }, InvalidBusinessIdError, 'El identificador del negocio no es válido.'],
    [{ businessId, resourceId: 'invalido' }, InvalidResourceIdError, 'El identificador del recurso no es válido.'],
  ])('rechaza identificadores inválidos sin consultar', async (input, error, message) => {
    await expect(useCase.execute(input)).rejects.toEqual(new error(message));
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findResource).not.toHaveBeenCalled();
  });

  it('rechaza Business inexistente o archivado antes de consultar Resource', async () => {
    findBusiness.mockResolvedValueOnce(null).mockResolvedValueOnce(makeBusiness(BusinessStatus.ARCHIVED));
    await expect(useCase.execute({ businessId, resourceId })).rejects.toEqual(new ResourceBusinessNotFoundError('El negocio no existe.'));
    await expect(useCase.execute({ businessId, resourceId })).rejects.toEqual(new ResourceBusinessArchivedError('El negocio está archivado.'));
    expect(findResource).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza Resource inexistente, cruzado o archivado sin persistir', async () => {
    findBusiness.mockResolvedValue(makeBusiness());
    findResource.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(makeResource(ResourceStatus.ARCHIVED));
    await expect(useCase.execute({ businessId, resourceId })).rejects.toEqual(new ResourceNotFoundError('El recurso no existe.'));
    await expect(useCase.execute({ businessId, resourceId: '33333333-3333-4333-8333-333333333333' })).rejects.toEqual(new ResourceNotFoundError('El recurso no existe.'));
    await expect(useCase.execute({ businessId, resourceId })).rejects.toEqual(new ResourceArchivedError('El recurso está archivado.'));
    expect(update).not.toHaveBeenCalled();
  });
});
