import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository } from '../domain/business.repository';
import { BusinessNotFoundError, GetBusinessByIdUseCase } from './get-business-by-id.use-case';

describe('GetBusinessByIdUseCase', () => {
  const business = Business.create({
    id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
    businessNumber: null,
    name: 'Cabañas del Lago',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status: BusinessStatus.ACTIVE,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });

  it('retorna el negocio encontrado', async () => {
    const findById = jest.fn<ReturnType<BusinessRepository['findById']>, Parameters<BusinessRepository['findById']>>()
      .mockResolvedValue(business);
    const useCase = new GetBusinessByIdUseCase({ create: jest.fn(), findById, list: jest.fn() });

    const result = await useCase.execute(business.id);

    expect(findById).toHaveBeenCalledWith(business.id);
    expect(result).toBe(business);
    expect(result.id).toBe('f8c49800-e50e-4d0e-b82b-0b51c09a0001');
    expect(result.name).toBe('Cabañas del Lago');
    expect(result.legalName).toBeNull();
    expect(result.taxId).toBeNull();
    expect(result.timezone).toBe('America/Asuncion');
    expect(result.currency).toBe('PYG');
    expect(result.status).toBe(BusinessStatus.ACTIVE);
  });

  it('rechaza cuando el negocio no existe', async () => {
    const useCase = new GetBusinessByIdUseCase({ create: jest.fn(), findById: jest.fn().mockResolvedValue(null), list: jest.fn() });

    await expect(useCase.execute('f8c49800-e50e-4d0e-b82b-0b51c09a0002')).rejects.toThrow(BusinessNotFoundError);
    await expect(useCase.execute('f8c49800-e50e-4d0e-b82b-0b51c09a0002')).rejects.toThrow('El negocio no existe.');
  });
});
