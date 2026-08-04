import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { CreateResourceUseCase, InvalidResourceInputError } from './create-resource.use-case';
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import type { CreateResourceData, ResourceRepository } from '../domain/resource.repository';

const id = '11111111-1111-4111-8111-111111111111';
const business = Business.create({ id, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
describe('CreateResourceUseCase', () => {
  const findById = jest.fn(); const findByBusinessAndCode = jest.fn(); const findByIdAndBusinessId = jest.fn(); const create = jest.fn<Promise<Resource>, [CreateResourceData]>();
  const repository: ResourceRepository = { findByBusinessAndCode, findByIdAndBusinessId, create };
  const useCase = new CreateResourceUseCase({ findById, create: jest.fn(), list: jest.fn(), update: jest.fn() }, repository);
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue(business); findByBusinessAndCode.mockResolvedValue(null); create.mockImplementation((data) => Promise.resolve(Resource.create({ id, businessId: data.businessId, name: data.name, internalCode: data.internalCode, description: data.description, capacityMinimum: data.capacityMinimum, capacityMaximum: data.capacityMaximum, capacityMaximumChildren: data.capacityMaximumChildren, status: ResourceStatus.ACTIVE, sortOrder: data.sortOrder, createdAt: new Date(), updatedAt: new Date() }))); });
  it('normaliza y aplica defaults', async () => { await expect(useCase.execute({ businessId: id, name: ' Cabaña 1 ', internalCode: ' cab-01 ', capacityMaximum: 4, description: ' ' })).resolves.toMatchObject({ name: 'Cabaña 1', internalCode: 'CAB-01', description: null, capacityMinimum: 1, capacityMaximumChildren: 0, sortOrder: 0, status: ResourceStatus.ACTIVE }); });
  it.each([0, 51, 1.5, '4', true, NaN, Infinity])('rechaza capacidad máxima inválida', async (capacityMaximum) => { await expect(useCase.execute({ businessId: id, name: 'Cab', internalCode: 'CAB', capacityMaximum })).rejects.toBeInstanceOf(InvalidResourceInputError); });
});
