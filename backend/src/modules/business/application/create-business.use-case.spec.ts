import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { type BusinessRepository, type CreateBusinessData } from '../domain/business.repository';
import { CreateBusinessUseCase, InvalidBusinessNameError } from './create-business.use-case';

describe('CreateBusinessUseCase', () => {
  const createdAt = new Date('2026-08-01T00:00:00.000Z');

  function createRepository(): {
    repository: BusinessRepository;
    create: jest.MockedFunction<BusinessRepository['create']>;
  } {
    const create: jest.MockedFunction<BusinessRepository['create']> = jest.fn((data: CreateBusinessData) =>
      Promise.resolve(
        Business.create({
          id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
          businessNumber: null,
          name: data.name,
          legalName: data.legalName ?? null,
          taxId: data.taxId ?? null,
          timezone: 'America/Asuncion',
          currency: 'PYG',
          status: BusinessStatus.ACTIVE,
          createdAt,
          updatedAt: createdAt,
        }),
      ),
    );

    return {
      repository: { create, findById: jest.fn(), list: jest.fn(), update: jest.fn() },
      create,
    };
  }

  it('crea un negocio con el nombre normalizado', async () => {
    const { repository, create } = createRepository();
    const useCase = new CreateBusinessUseCase(repository);

    const business = await useCase.execute({
      name: '  Cabañas del Lago  ',
      legalName: 'Cabañas del Lago S.R.L.',
      taxId: '80012345-6',
    });

    expect(business.name).toBe('Cabañas del Lago');
    expect(business.status).toBe(BusinessStatus.ACTIVE);
    expect(create).toHaveBeenCalledWith({
      name: 'Cabañas del Lago',
      legalName: 'Cabañas del Lago S.R.L.',
      taxId: '80012345-6',
    });
  });

  it('rechaza un nombre obligatorio vacío', async () => {
    const { repository } = createRepository();
    const useCase = new CreateBusinessUseCase(repository);

    await expect(useCase.execute({ name: '   ' })).rejects.toThrow(InvalidBusinessNameError);
    await expect(useCase.execute({ name: '   ' })).rejects.toThrow('El nombre del negocio es obligatorio.');
  });

  it('rechaza un nombre undefined', async () => {
    const { repository } = createRepository();
    const useCase = new CreateBusinessUseCase(repository);

    await expect(useCase.execute({ name: undefined as unknown as string })).rejects.toThrow(InvalidBusinessNameError);
    await expect(useCase.execute({ name: undefined as unknown as string })).rejects.toThrow('El nombre del negocio es obligatorio.');
  });

  it('acepta un nombre de exactamente 120 caracteres y conserva opcionales ausentes', async () => {
    const { repository, create } = createRepository();
    const useCase = new CreateBusinessUseCase(repository);
    const name = 'a'.repeat(120);

    await useCase.execute({ name });

    expect(create).toHaveBeenCalledWith({ name });
  });

  it('rechaza un nombre que supera el máximo permitido', async () => {
    const { repository } = createRepository();
    const useCase = new CreateBusinessUseCase(repository);

    await expect(useCase.execute({ name: 'a'.repeat(121) })).rejects.toThrow(InvalidBusinessNameError);
    await expect(useCase.execute({ name: 'a'.repeat(121) })).rejects.toThrow('El nombre del negocio no puede superar los 120 caracteres.');
  });
});
