import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type { BusinessRepository } from '../../business/domain/business.repository';
import { RatePlan } from '../domain/rate-plan.entity';
import type { RatePlanRepository } from '../domain/rate-plan.repository';
import type { PricingResourceLookup } from '../domain/resource.lookup';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import {
  CreateRatePlanUseCase,
  InvalidRatePlanInputError,
  RatePlanBusinessArchivedError,
  RatePlanBusinessNotFoundError,
  RatePlanResourceArchivedError,
  RatePlanResourceNotFoundError,
} from './create-rate-plan.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const anotherResourceId = '33333333-3333-4333-8333-333333333333';

const business = (status = BusinessStatus.ACTIVE): Business =>
  Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const plan = (): RatePlan =>
  RatePlan.create({
    id: '44444444-4444-4444-8444-444444444444',
    businessId,
    name: 'Estándar',
    description: null,
    baseNightlyAmountMinor: 450000,
    currency: 'PYG',
    status: RatePlanStatus.ACTIVE,
    validFrom: null,
    validTo: null,
    resources: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

describe('CreateRatePlanUseCase', () => {
  const findBusiness: jest.MockedFunction<BusinessRepository['findById']> = jest.fn();
  const findResource: jest.MockedFunction<PricingResourceLookup['findByIdAndBusinessId']> = jest.fn();
  const create: jest.MockedFunction<RatePlanRepository['create']> = jest.fn();
  const subject = new CreateRatePlanUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource },
    { create, findByIdAndBusinessId: jest.fn(), update: jest.fn() },
  );
  const input = {
    businessId,
    name: ' Estándar ',
    description: ' Habitual ',
    baseNightlyAmountMinor: 450000,
    validFrom: '2026-08-01',
    validTo: '2026-09-01',
    resourceIds: [resourceId],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findResource.mockResolvedValue({ id: resourceId, businessId, status: 'ACTIVE' });
    create.mockResolvedValue(plan());
  });

  it('normaliza y crea con moneda del Business y dependencias exactas', async () => {
    const createdPlan = plan();
    create.mockResolvedValueOnce(createdPlan);
    await expect(subject.execute(input)).resolves.toBe(createdPlan);
    expect(findBusiness).toHaveBeenCalledTimes(1);
    expect(findBusiness).toHaveBeenCalledWith(businessId);
    expect(findResource).toHaveBeenCalledTimes(1);
    expect(findResource).toHaveBeenCalledWith(resourceId, businessId);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      businessId,
      name: 'Estándar',
      description: 'Habitual',
      baseNightlyAmountMinor: 450000,
      currency: 'PYG',
      validFrom: '2026-08-01',
      validTo: '2026-09-01',
      resourceIds: [resourceId],
    });
  });

  it.each([
    [{ ...input, businessId: 'invalid' }, 'El identificador del negocio no es válido.'],
    [{ ...input, name: undefined }, 'El nombre de la tarifa es obligatorio.'],
    [{ ...input, name: 1 }, 'El nombre de la tarifa es obligatorio.'],
    [{ ...input, name: ' ' }, 'El nombre de la tarifa debe tener entre 2 y 120 caracteres.'],
    [{ ...input, name: 'A' }, 'El nombre de la tarifa debe tener entre 2 y 120 caracteres.'],
    [{ ...input, name: 'a'.repeat(121) }, 'El nombre de la tarifa debe tener entre 2 y 120 caracteres.'],
    [{ ...input, description: 1 }, 'La descripción es inválida.'],
    [{ ...input, description: 'a'.repeat(501) }, 'La descripción es inválida.'],
    [{ ...input, baseNightlyAmountMinor: undefined }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: 0 }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: -1 }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: 1.5 }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: '1' }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: true }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: Number.NaN }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: Infinity }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, baseNightlyAmountMinor: 2147483648 }, 'La tarifa base por noche debe ser un entero positivo válido.'],
    [{ ...input, validFrom: 'invalid' }, 'La fecha de inicio es inválida.'],
    [{ ...input, validTo: '2026-02-30' }, 'La fecha de fin es inválida.'],
    [{ ...input, validFrom: '2026-09-01', validTo: '2026-09-01' }, 'La fecha de inicio debe ser anterior a la fecha de fin.'],
    [{ ...input, validFrom: '2026-09-02', validTo: '2026-09-01' }, 'La fecha de inicio debe ser anterior a la fecha de fin.'],
    [{ ...input, resourceIds: undefined }, 'La lista de Resources es obligatoria.'],
    [{ ...input, resourceIds: 'x' }, 'La lista de Resources es obligatoria.'],
    [{ ...input, resourceIds: ['invalid'] }, 'Los identificadores de Resources deben ser UUID válidos.'],
    [{ ...input, resourceIds: [resourceId, resourceId] }, 'La lista de Resources no puede contener duplicados.'],
  ])('rechaza %# con el mensaje exacto', async (invalid, message) => {
    await expect(subject.execute(invalid)).rejects.toEqual(
      new InvalidRatePlanInputError(message),
    );
    expect(findBusiness).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('acepta los límites válidos y normaliza null, vacío y fechas parciales', async () => {
    await subject.execute({
      businessId,
      name: 'a'.repeat(120),
      description: ' ',
      baseNightlyAmountMinor: 1,
      validFrom: '2026-08-01',
      resourceIds: [],
    });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'a'.repeat(120), description: null, baseNightlyAmountMinor: 1,
      validFrom: '2026-08-01', validTo: null, resourceIds: [],
    }));
    await subject.execute({
      businessId, name: 'Plan', description: null, baseNightlyAmountMinor: 2147483647,
      validTo: '2026-09-01', resourceIds: [],
    });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      description: null, baseNightlyAmountMinor: 2147483647, validFrom: null, validTo: '2026-09-01',
    }));
  });

  it('distingue límites y formatos exactos de descripción, fecha e identificador', async () => {
    await subject.execute({
      businessId,
      name: 'AB',
      description: ` ${'a'.repeat(500)} `,
      baseNightlyAmountMinor: 1,
      validFrom: null,
      validTo: null,
      resourceIds: [],
    });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'AB', description: 'a'.repeat(500), validFrom: null, validTo: null,
    }));
    await expect(subject.execute({ ...input, validFrom: 'x2026-08-01' })).rejects.toEqual(
      new InvalidRatePlanInputError('La fecha de inicio es inválida.'),
    );
    await expect(subject.execute({ ...input, validTo: '2026-09-01x' })).rejects.toEqual(
      new InvalidRatePlanInputError('La fecha de fin es inválida.'),
    );
    await expect(subject.execute({ ...input, resourceIds: [1] })).rejects.toEqual(
      new InvalidRatePlanInputError('Los identificadores de Resources deben ser UUID válidos.'),
    );
    await expect(subject.execute({ ...input, resourceIds: [`x${resourceId}`] })).rejects.toEqual(
      new InvalidRatePlanInputError('Los identificadores de Resources deben ser UUID válidos.'),
    );
    await expect(subject.execute({ ...input, resourceIds: [`${resourceId}x`] })).rejects.toEqual(
      new InvalidRatePlanInputError('Los identificadores de Resources deben ser UUID válidos.'),
    );
  });

  it('valida cada Resource en orden, permite OUT_OF_SERVICE y conserva los IDs', async () => {
    findResource
      .mockResolvedValueOnce({ id: resourceId, businessId, status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: anotherResourceId, businessId, status: 'OUT_OF_SERVICE' });
    await subject.execute({ ...input, resourceIds: [resourceId, anotherResourceId] });
    expect(findResource).toHaveBeenNthCalledWith(1, resourceId, businessId);
    expect(findResource).toHaveBeenNthCalledWith(2, anotherResourceId, businessId);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ resourceIds: [resourceId, anotherResourceId] }));
  });

  it('informa Business inexistente o archivado y no continúa', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toEqual(
      new RatePlanBusinessNotFoundError('El negocio no existe.'),
    );
    expect(findResource).not.toHaveBeenCalled();
    findBusiness.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    await expect(subject.execute(input)).rejects.toEqual(
      new RatePlanBusinessArchivedError('El negocio está archivado.'),
    );
    expect(findResource).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('informa Resource inexistente o archivado y no persiste', async () => {
    findResource.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toEqual(
      new RatePlanResourceNotFoundError('El recurso no existe.'),
    );
    expect(create).not.toHaveBeenCalled();
    findResource.mockResolvedValueOnce({ id: resourceId, businessId, status: 'ARCHIVED' });
    await expect(subject.execute(input)).rejects.toEqual(
      new RatePlanResourceArchivedError('El recurso está archivado.'),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('propaga errores inesperados sin informar una creación exitosa', async () => {
    const failure = new Error('database unavailable');
    create.mockRejectedValueOnce(failure);
    await expect(subject.execute(input)).rejects.toBe(failure);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
