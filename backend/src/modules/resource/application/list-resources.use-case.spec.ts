import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Resource } from '../domain/resource.entity';
import { ResourceStatus } from '../domain/resource-status.enum';
import { InvalidBusinessIdError, ResourceBusinessNotFoundError } from './get-resource.use-case';
import { ListResourcesUseCase } from './list-resources.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const business = Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ARCHIVED, createdAt: new Date(), updatedAt: new Date() });
const resources = [Resource.create({ id: '22222222-2222-4222-8222-222222222222', businessId, name: 'A', internalCode: 'A', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() }), Resource.create({ id: '33333333-3333-4333-8333-333333333333', businessId, name: 'B', internalCode: 'B', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ARCHIVED, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() })];

describe('ListResourcesUseCase', () => {
  const findById = jest.fn();
  const listByBusinessId = jest.fn();
  const useCase = new ListResourcesUseCase({ findById, create: jest.fn(), list: jest.fn(), update: jest.fn() }, { findByBusinessAndCode: jest.fn(), findByIdAndBusinessId: jest.fn(), listByBusinessId, create: jest.fn() });
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue(business); listByBusinessId.mockResolvedValue(resources); });
  it('retorna exactamente todos los estados en el orden del repositorio incluso para Business archivado', async () => { await expect(useCase.execute(businessId)).resolves.toBe(resources); expect(findById).toHaveBeenCalledWith(businessId); expect(listByBusinessId).toHaveBeenCalledWith(businessId); });
  it('retorna una lista vacía', async () => { listByBusinessId.mockResolvedValue([]); await expect(useCase.execute(businessId)).resolves.toEqual([]); });
  it('rechaza identificador inválido y Business inexistente sin consultar Resources', async () => { await expect(useCase.execute('invalid')).rejects.toBeInstanceOf(InvalidBusinessIdError); findById.mockResolvedValue(null); await expect(useCase.execute(businessId)).rejects.toBeInstanceOf(ResourceBusinessNotFoundError); expect(listByBusinessId).not.toHaveBeenCalled(); });
});
