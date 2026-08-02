import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { UpdateBusinessUseCase, InvalidBusinessUpdateError } from './update-business.use-case';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

describe('UpdateBusinessUseCase', () => {
  const original = Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: 1, name: 'Original', legalName: 'Original S.A.', taxId: '8001', timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
  function useCase(found: Business | null = original) {
    const update = jest.fn().mockImplementation((business: Business) => Promise.resolve(business));
    return { update, useCase: new UpdateBusinessUseCase({ create: jest.fn(), findById: jest.fn().mockResolvedValue(found), list: jest.fn(), update }) };
  }
  it('actualiza solo el nombre y preserva campos no enviados', async () => {
    const { useCase: subject, update } = useCase();
    const result = await subject.execute(original.id, { name: '  Nuevo  ' });
    expect(result.name).toBe('Nuevo'); expect(result.legalName).toBe('Original S.A.'); expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuevo', taxId: '8001' }));
  });
  it('permite limpiar campos opcionales y actualizar varios valores', async () => {
    const { useCase: subject } = useCase();
    const result = await subject.execute(original.id, { legalName: null, taxId: null, timezone: 'America/New_York', currency: 'PYG' });
    expect(result.legalName).toBeNull(); expect(result.taxId).toBeNull(); expect(result.timezone).toBe('America/New_York');
  });
  it('acepta una zona horaria IANA válida', async () => {
    const { useCase: subject } = useCase();

    const result = await subject.execute(original.id, { timezone: 'Europe/Madrid' });

    expect(result.timezone).toBe('Europe/Madrid');
  });

  it('preserva la zona horaria cuando no se envía', async () => {
    const { useCase: subject } = useCase();

    const result = await subject.execute(original.id, { name: 'Nuevo' });

    expect(result.timezone).toBe('America/Asuncion');
  });

  it('rechaza una zona horaria inválida con el mensaje de negocio', async () => {
    const { useCase: subject } = useCase();

    await expect(subject.execute(original.id, { timezone: 'invalid' })).rejects.toThrow('La zona horaria no es válida.');
  });

  it('rechaza una actualización sin campos con el mensaje de negocio', async () => {
    const { useCase: subject } = useCase();

    await expect(subject.execute(original.id, {})).rejects.toBeInstanceOf(InvalidBusinessUpdateError);
    await expect(subject.execute(original.id, {})).rejects.toThrow('Se requiere al menos un campo actualizable.');
  });

  it.each([{ name: '   ' }, { name: 'a'.repeat(121) }, { currency: 'USD' }])('rechaza actualizaciones inválidas', async (request) => {
    const { useCase: subject } = useCase();
    await expect(subject.execute(original.id, request)).rejects.toThrow(InvalidBusinessUpdateError);
  });
  it('informa cuando el negocio no existe', async () => {
    const { useCase: subject } = useCase(null);
    await expect(subject.execute(original.id, { name: 'Nuevo' })).rejects.toThrow(BusinessNotFoundError);
  });
});
