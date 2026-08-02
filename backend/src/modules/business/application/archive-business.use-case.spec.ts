import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { ArchiveBusinessUseCase } from './archive-business.use-case';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

describe('ArchiveBusinessUseCase', () => {
  const business = Business.create({ id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: 12, name: 'Cabañas del Lago', legalName: 'Cabañas del Lago S.R.L.', taxId: '80000000-0', timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') });

  it('archiva un negocio activo mediante el repositorio', async () => {
    const update = jest.fn().mockImplementation((value: Business) => Promise.resolve(value));
    const findById = jest.fn().mockResolvedValue(business);
    const subject = new ArchiveBusinessUseCase({ create: jest.fn(), findById, list: jest.fn(), update });

    const result = await subject.execute(business.id);

    expect(findById).toHaveBeenCalledWith(business.id);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: BusinessStatus.ARCHIVED }));
    expect(result.status).toBe(BusinessStatus.ARCHIVED);
  });

  it('informa con el mensaje exacto cuando el negocio no existe', async () => {
    const subject = new ArchiveBusinessUseCase({ create: jest.fn(), findById: jest.fn().mockResolvedValue(null), list: jest.fn(), update: jest.fn() });

    await expect(subject.execute(business.id)).rejects.toBeInstanceOf(BusinessNotFoundError);
    await expect(subject.execute(business.id)).rejects.toThrow('El negocio no existe.');
  });

  it('es idempotente para un negocio archivado', async () => {
    const archived = business.archive();
    const update = jest.fn();
    const subject = new ArchiveBusinessUseCase({ create: jest.fn(), findById: jest.fn().mockResolvedValue(archived), list: jest.fn(), update });

    await expect(subject.execute(archived.id)).resolves.toBe(archived);
    expect(update).not.toHaveBeenCalled();
  });
});
