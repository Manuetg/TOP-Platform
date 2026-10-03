import { Business } from '../domain/business.entity';
import { BusinessChangeForbiddenError, type BusinessChangeRepository } from '../domain/business-change.repository';
import { BusinessStatus } from '../domain/business-status.enum';
import { ArchiveBusinessUseCase } from './archive-business.use-case';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

describe('ArchiveBusinessUseCase', () => {
  const actorUserId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
  const business = Business.create({
    id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: 12,
    name: 'Establecimiento de prueba', legalName: 'Establecimiento de prueba S.R.L.', taxId: 'ID de prueba',
    timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  function useCase(result: Business = business.archive()) {
    const repository = {
      changeProfile: jest.fn<ReturnType<BusinessChangeRepository['changeProfile']>, Parameters<BusinessChangeRepository['changeProfile']>>(),
      archive: jest.fn<ReturnType<BusinessChangeRepository['archive']>, Parameters<BusinessChangeRepository['archive']>>().mockResolvedValue(result),
    } satisfies BusinessChangeRepository;
    return { repository, subject: new ArchiveBusinessUseCase(repository) };
  }

  it('delega archivo con identificador y actor sin reenviar datos del perfil', async () => {
    const archived = business.archive();
    const { subject, repository } = useCase(archived);
    const result = await subject.execute(business.id, actorUserId);
    expect(repository.archive).toHaveBeenCalledTimes(1);
    expect(repository.archive).toHaveBeenCalledWith({ id: business.id, actorUserId });
    expect(repository.changeProfile).not.toHaveBeenCalled();
    expect(result).toBe(archived);
    expect(result.status).toBe(BusinessStatus.ARCHIVED);
  });

  it('conserva el resultado idempotente del puerto y sus fechas originales', async () => {
    const archived = business.archive();
    const { subject, repository } = useCase(archived);
    await expect(subject.execute(archived.id, actorUserId)).resolves.toBe(archived);
    await expect(subject.execute(archived.id, actorUserId)).resolves.toBe(archived);
    expect(repository.archive).toHaveBeenCalledTimes(2);
    expect(repository.archive).toHaveBeenNthCalledWith(2, { id: archived.id, actorUserId });
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it.each([
    new BusinessNotFoundError('El negocio no existe.'),
    new BusinessChangeForbiddenError('El usuario no puede archivar el establecimiento.'),
  ])('propaga error del puerto sin reintentar: %p', async (error) => {
    const { subject, repository } = useCase();
    repository.archive.mockRejectedValue(error);
    await expect(subject.execute(business.id, actorUserId)).rejects.toBe(error);
    expect(repository.archive).toHaveBeenCalledTimes(1);
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });
});
