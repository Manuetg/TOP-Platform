import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository } from '../domain/business.repository';
import { ListBusinessesUseCase } from './list-businesses.use-case';

describe('ListBusinessesUseCase', () => {
  function business(id: string, name: string, createdAt: string): Business {
    const timestamp = new Date(createdAt);

    return Business.create({
      id,
      businessNumber: null,
      name,
      legalName: null,
      taxId: null,
      timezone: 'America/Asuncion',
      currency: 'PYG',
      status: BusinessStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  function createRepository(items: Business[]): {
    repository: BusinessRepository;
    list: jest.MockedFunction<BusinessRepository['list']>;
  } {
    const list: jest.MockedFunction<BusinessRepository['list']> = jest.fn().mockResolvedValue(items);

    return { repository: { create: jest.fn(), findById: jest.fn(), list, update: jest.fn() }, list };
  }

  it('retorna una lista vacía', async () => {
    const { repository, list } = createRepository([]);
    const useCase = new ListBusinessesUseCase(repository);

    await expect(useCase.execute()).resolves.toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('retorna una lista con un negocio', async () => {
    const item = business('f8c49800-e50e-4d0e-b82b-0b51c09a0001', 'Cabañas del Lago', '2026-01-01T00:00:00.000Z');
    const { repository } = createRepository([item]);
    const useCase = new ListBusinessesUseCase(repository);

    await expect(useCase.execute()).resolves.toEqual([item]);
  });

  it('conserva el orden ascendente por fecha recibido del repositorio', async () => {
    const first = business('f8c49800-e50e-4d0e-b82b-0b51c09a0001', 'Primero', '2026-01-01T00:00:00.000Z');
    const second = business('f8c49800-e50e-4d0e-b82b-0b51c09a0002', 'Segundo', '2026-01-02T00:00:00.000Z');
    const third = business('f8c49800-e50e-4d0e-b82b-0b51c09a0003', 'Tercero', '2026-01-03T00:00:00.000Z');
    const { repository } = createRepository([first, second, third]);
    const useCase = new ListBusinessesUseCase(repository);

    const businesses = await useCase.execute();

    expect(businesses).toHaveLength(3);
    expect(businesses.map((item) => item.id)).toEqual([first.id, second.id, third.id]);
    expect(businesses.map((item) => item.createdAt)).toEqual([first.createdAt, second.createdAt, third.createdAt]);
  });
});
