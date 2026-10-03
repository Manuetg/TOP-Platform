import { Business, type BusinessUpdate } from '../domain/business.entity';
import {
  BusinessChangeConflictError,
  BusinessChangeForbiddenError,
  type BusinessChangeRepository,
} from '../domain/business-change.repository';
import { BusinessStatus } from '../domain/business-status.enum';
import { UpdateBusinessUseCase, InvalidBusinessUpdateError } from './update-business.use-case';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

describe('UpdateBusinessUseCase', () => {
  const actorUserId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
  const expectedUpdatedAt = '2026-01-01T00:00:00.000Z';
  const original = Business.create({
    id: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001', businessNumber: 1,
    name: 'Original', legalName: 'Original S.A.', taxId: '8001',
    country: 'Paraguay', region: 'Central', city: 'Areguá', address: 'Dirección de prueba',
    timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE,
    createdAt: new Date(expectedUpdatedAt), updatedAt: new Date(expectedUpdatedAt),
  });

  function useCase(result: Business = original) {
    const repository = {
      changeProfile: jest.fn<ReturnType<BusinessChangeRepository['changeProfile']>, Parameters<BusinessChangeRepository['changeProfile']>>().mockResolvedValue(result),
      archive: jest.fn<ReturnType<BusinessChangeRepository['archive']>, Parameters<BusinessChangeRepository['archive']>>(),
    } satisfies BusinessChangeRepository;
    return { repository, subject: new UpdateBusinessUseCase(repository) };
  }

  it('envía solo los campos editados, la versión y el actor al puerto', async () => {
    const saved = original.update({ name: 'Nuevo' });
    const { subject, repository } = useCase(saved);
    const result = await subject.execute(original.id, { name: '  Nuevo  ', expectedUpdatedAt }, actorUserId);
    expect(result).toBe(saved);
    expect(repository.changeProfile).toHaveBeenCalledTimes(1);
    expect(repository.changeProfile).toHaveBeenCalledWith({
      id: original.id, actorUserId, expectedUpdatedAt: new Date(expectedUpdatedAt), changes: { name: 'Nuevo' },
    });
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('omite undefined sin reenviar valores persistidos ni estado', async () => {
    const { subject, repository } = useCase();
    await subject.execute(original.id, {
      name: 'Nuevo', legalName: undefined, taxId: undefined, country: undefined,
      region: undefined, city: undefined, address: undefined, timezone: undefined,
      currency: undefined, expectedUpdatedAt,
    }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith({
      id: original.id, actorUserId, expectedUpdatedAt: new Date(expectedUpdatedAt), changes: { name: 'Nuevo' },
    });
  });

  it.each([null, '', ' \t\n '])('normaliza %p como limpieza explícita', async (value) => {
    const { subject, repository } = useCase();
    await subject.execute(original.id, {
      legalName: value, taxId: value, country: value, region: value,
      city: value, address: value, expectedUpdatedAt,
    }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({
      changes: { legalName: null, taxId: null, country: null, region: null, city: null, address: null },
    }));
  });

  it('normaliza campos opcionales sin imponer formato fiscal', async () => {
    const { subject, repository } = useCase();
    await subject.execute(original.id, {
      legalName: '  Establecimiento de prueba S.A.  ', taxId: '  ID fiscal de prueba  ',
      country: '  Paraguay  ', region: '  Central  ', city: '  Areguá  ',
      address: '  Dirección de prueba  ', expectedUpdatedAt,
    }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({ changes: {
      legalName: 'Establecimiento de prueba S.A.', taxId: 'ID fiscal de prueba',
      country: 'Paraguay', region: 'Central', city: 'Areguá', address: 'Dirección de prueba',
    } }));
  });

  it('no introduce límites para razón social e identificación', async () => {
    const { subject, repository } = useCase();
    const value = 'a'.repeat(501);
    await subject.execute(original.id, { legalName: value, taxId: value, expectedUpdatedAt }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({
      changes: { legalName: value, taxId: value },
    }));
  });

  it('acepta el límite del nombre después de trim', async () => {
    const { subject, repository } = useCase();
    const name = 'a'.repeat(120);
    await subject.execute(original.id, { name: `  ${name}  `, expectedUpdatedAt }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({ changes: { name } }));
  });

  it.each([null, 42, false, {}, [], '', '   ', 'a'.repeat(121)].map((name) => ({ name })))('rechaza nombre inválido $name antes del puerto', async ({ name }) => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, {
      name: name as unknown as BusinessUpdate['name'], expectedUpdatedAt,
    }, actorUserId)).rejects.toBeInstanceOf(InvalidBusinessUpdateError);
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  const locationLimits = [
    { field: 'country', maximum: 120 }, { field: 'region', maximum: 120 },
    { field: 'city', maximum: 120 }, { field: 'address', maximum: 500 },
  ] as const;

  it.each(locationLimits)('acepta $field en su límite después de trim', async ({ field, maximum }) => {
    const { subject, repository } = useCase();
    const value = 'a'.repeat(maximum);
    await subject.execute(original.id, { [field]: `  ${value}  `, expectedUpdatedAt }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({ changes: { [field]: value } }));
  });

  it.each(locationLimits)('rechaza $field por encima del límite normalizado', async ({ field, maximum }) => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, {
      [field]: `  ${'a'.repeat(maximum + 1)}  `, expectedUpdatedAt,
    }, actorUserId)).rejects.toBeInstanceOf(InvalidBusinessUpdateError);
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it('acepta zona horaria IANA y moneda PYG explícitas', async () => {
    const { subject, repository } = useCase();
    await subject.execute(original.id, { timezone: 'Europe/Madrid', currency: 'PYG', expectedUpdatedAt }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({
      changes: { timezone: 'Europe/Madrid', currency: 'PYG' },
    }));
  });

  it('rechaza zona horaria inválida antes del puerto', async () => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, { timezone: 'invalid', expectedUpdatedAt }, actorUserId))
      .rejects.toThrow('La zona horaria no es válida.');
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it.each(['USD', 'EUR', 'pyg', '', null, 42])('rechaza moneda no admitida %p antes del puerto', async (currency) => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, {
      currency: currency as unknown as BusinessUpdate['currency'], expectedUpdatedAt,
    }, actorUserId)).rejects.toBeInstanceOf(InvalidBusinessUpdateError);
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it.each([{}, { name: undefined }, { legalName: undefined, city: undefined }])('rechaza edición sin campos %p', async (changes) => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, { ...changes, expectedUpdatedAt }, actorUserId))
      .rejects.toThrow('Se requiere al menos un campo actualizable.');
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, '', 42, new Date(expectedUpdatedAt),
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000+00:00',
    '2026-01-01T00:00:00.0000Z', '2026-02-30T00:00:00.000Z',
    ' 2026-01-01T00:00:00.000Z ', 'invalid',
  ])('rechaza versión ausente o no canónica %p antes del puerto', async (version) => {
    const { subject, repository } = useCase();
    await expect(subject.execute(original.id, { name: 'Nuevo', expectedUpdatedAt: version }, actorUserId))
      .rejects.toBeInstanceOf(InvalidBusinessUpdateError);
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it('conserva los milisegundos exactos de la versión enviada', async () => {
    const { subject, repository } = useCase();
    const version = '2026-01-01T00:00:00.123Z';
    await subject.execute(original.id, { name: 'Nuevo', expectedUpdatedAt: version }, actorUserId);
    expect(repository.changeProfile).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: new Date(version) }));
  });

  it.each([
    new BusinessNotFoundError('El negocio no existe.'),
    new BusinessChangeConflictError('La versión ya cambió.'),
    new BusinessChangeForbiddenError('El usuario no puede editar el establecimiento.'),
  ])('propaga error del puerto sin convertirlo ni reintentar: %p', async (error) => {
    const { subject, repository } = useCase();
    repository.changeProfile.mockRejectedValue(error);
    await expect(subject.execute(original.id, { name: 'Nuevo', expectedUpdatedAt }, actorUserId)).rejects.toBe(error);
    expect(repository.changeProfile).toHaveBeenCalledTimes(1);
  });
});
