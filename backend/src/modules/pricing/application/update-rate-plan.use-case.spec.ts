import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type { BusinessRepository } from '../../business/domain/business.repository';
import { InvalidRatePlanInputError, RatePlanBusinessArchivedError, RatePlanBusinessNotFoundError, RatePlanResourceArchivedError, RatePlanResourceNotFoundError } from './create-rate-plan.use-case';
import { RatePlanArchivedError, RatePlanNotFoundError, UpdateRatePlanUseCase } from './update-rate-plan.use-case';
import { SeasonalRateValidityConflictError } from './seasonal-rate.errors';
import { RatePlan } from '../domain/rate-plan.entity';
import type { RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import type { PricingResourceLookup } from '../domain/resource.lookup';

const businessId = '11111111-1111-4111-8111-111111111111';
const ratePlanId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const resourceIdTwo = '44444444-4444-4444-8444-444444444444';
const business = (status = BusinessStatus.ACTIVE): Business => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const plan = (status = RatePlanStatus.ACTIVE, validFrom: string | null = '2026-08-01', validTo: string | null = '2026-09-01'): RatePlan => RatePlan.create({ id: ratePlanId, businessId, name: 'Plan original', description: 'Descripción inicial', baseNightlyAmountMinor: 450000, currency: 'PYG', status, validFrom, validTo, resources: [], createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

describe('UpdateRatePlanUseCase', () => {
  const findBusiness = jest.fn(); const findPlan = jest.fn(); const findResource = jest.fn(); const update = jest.fn(); const hasOutsideValidity = jest.fn();
  const businesses: BusinessRepository = { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() };
  const resources: PricingResourceLookup = { findByIdAndBusinessId: findResource };
  const plans: RatePlanRepository = { findByIdAndBusinessId: findPlan, update, create: jest.fn() };
  const subject = new UpdateRatePlanUseCase(businesses, resources, plans, { create: jest.fn(), listByRatePlanId: jest.fn(), listIntersectingRange: jest.fn(), hasOverlap: jest.fn(), hasOutsideValidity });
  const input = { businessId, ratePlanId };
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue(business()); findPlan.mockResolvedValue(plan()); findResource.mockResolvedValue({ id: resourceId, businessId, status: 'ACTIVE' }); update.mockResolvedValue(plan()); hasOutsideValidity.mockResolvedValue(false); });

  async function invalid(value: Record<string, unknown>, message: string): Promise<void> { await expect(subject.execute({ ...input, ...value })).rejects.toThrow(new InvalidRatePlanInputError(message)); }

  it('preserves omitted fields and distinguishes undefined from an empty resource list', async () => {
    await subject.execute({ ...input, baseNightlyAmountMinor: 500000 });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Plan original', description: 'Descripción inicial', validFrom: '2026-08-01', validTo: '2026-09-01', resourceIds: undefined, baseNightlyAmountMinor: 500000 }));
    await subject.execute({ ...input, resourceIds: [] });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ resourceIds: [] })); expect(findResource).not.toHaveBeenCalled();
  });
  it('validates identifiers before any dependency lookup', async () => {
    await invalid({ businessId: 'x', name: 'Plan' }, 'El identificador del negocio no es válido.');
    await invalid({ ratePlanId: 'x', name: 'Plan' }, 'El identificador de la tarifa no es válido.');
    expect(findBusiness).not.toHaveBeenCalled(); expect(findPlan).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it('rejects an empty body with its exact message', async () => { await invalid({}, 'Se requiere al menos un campo actualizable.'); });
  it('normalizes a valid name and enforces both limits', async () => {
    await subject.execute({ ...input, name: '  Plan nuevo  ' }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Plan nuevo' }));
    await subject.execute({ ...input, name: 'n'.repeat(120) }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'n'.repeat(120) }));
    await invalid({ name: ' ' }, 'El nombre de la tarifa debe tener entre 2 y 120 caracteres.'); await invalid({ name: 'n'.repeat(121) }, 'El nombre de la tarifa debe tener entre 2 y 120 caracteres.'); await invalid({ name: 1 }, 'El nombre de la tarifa es obligatorio.');
  });
  it('cleans, preserves and validates description boundaries', async () => {
    await subject.execute({ ...input, description: null }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ description: null }));
    await subject.execute({ ...input, description: '   ' }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ description: null }));
    await subject.execute({ ...input, description: ` ${'d'.repeat(500)} ` }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'd'.repeat(500) }));
    await invalid({ description: 'd'.repeat(501) }, 'La descripción es inválida.'); await invalid({ description: 10 }, 'La descripción es inválida.');
  });
  it.each([0, -1, 1.5, '1', true, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid amounts: %p', async (amount) => invalid({ baseNightlyAmountMinor: amount }, 'La tarifa base por noche debe ser un entero positivo válido.'));
  it('accepts amount boundaries and preserves the exact amount', async () => { await subject.execute({ ...input, baseNightlyAmountMinor: 1 }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ baseNightlyAmountMinor: 1 })); await subject.execute({ ...input, baseNightlyAmountMinor: 2147483647 }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ baseNightlyAmountMinor: 2147483647 })); });
  it('validates real dates and the final combined interval', async () => {
    await invalid({ validFrom: '2026-02-30' }, 'La fecha de inicio es inválida.'); await invalid({ validTo: 'date' }, 'La fecha de fin es inválida.');
    await invalid({ validFrom: '2026-09-01' }, 'La fecha de inicio debe ser anterior a la fecha de fin.'); await invalid({ validTo: '2026-08-01' }, 'La fecha de inicio debe ser anterior a la fecha de fin.');
    await subject.execute({ ...input, validFrom: null, validTo: null }); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ validFrom: null, validTo: null }));
  });
  it('validates resource ids, duplicates and exact tenant lookup calls', async () => {
    await invalid({ resourceIds: 'bad' }, 'Los identificadores de Resources deben ser UUID válidos.'); await invalid({ resourceIds: ['bad'] }, 'Los identificadores de Resources deben ser UUID válidos.'); await invalid({ resourceIds: [resourceId, resourceId] }, 'La lista de Resources no puede contener duplicados.');
    findResource.mockImplementation((id: string) => Promise.resolve({ id, businessId, status: 'ACTIVE' }));
    await subject.execute({ ...input, resourceIds: [resourceId, resourceIdTwo] });
    expect(findResource).toHaveBeenNthCalledWith(1, resourceId, businessId); expect(findResource).toHaveBeenNthCalledWith(2, resourceIdTwo, businessId); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ resourceIds: [resourceId, resourceIdTwo] }));
  });
  it('permits OUT_OF_SERVICE but rejects missing and archived Resources', async () => {
    findResource.mockResolvedValue({ id: resourceId, businessId, status: 'OUT_OF_SERVICE' }); await subject.execute({ ...input, resourceIds: [resourceId] });
    findResource.mockResolvedValue(null); await expect(subject.execute({ ...input, resourceIds: [resourceId] })).rejects.toThrow(new RatePlanResourceNotFoundError('El recurso no existe.'));
    findResource.mockResolvedValue({ id: resourceId, businessId, status: 'ARCHIVED' }); await expect(subject.execute({ ...input, resourceIds: [resourceId] })).rejects.toThrow(new RatePlanResourceArchivedError('El recurso está archivado.'));
  });
  it('stops before the RatePlan lookup for invalid Business states', async () => {
    findBusiness.mockResolvedValue(null); await expect(subject.execute({ ...input, name: 'Nuevo' })).rejects.toThrow(new RatePlanBusinessNotFoundError('El negocio no existe.')); expect(findPlan).not.toHaveBeenCalled();
    findBusiness.mockResolvedValue(business(BusinessStatus.ARCHIVED)); await expect(subject.execute({ ...input, name: 'Nuevo' })).rejects.toThrow(new RatePlanBusinessArchivedError('El negocio está archivado.')); expect(findPlan).not.toHaveBeenCalled();
  });
  it('rejects missing or archived RatePlans and propagates persistence errors', async () => {
    findPlan.mockResolvedValue(null); await expect(subject.execute({ ...input, name: 'Nuevo' })).rejects.toThrow(new RatePlanNotFoundError('La tarifa no existe.'));
    findPlan.mockResolvedValue(plan(RatePlanStatus.ARCHIVED)); await expect(subject.execute({ ...input, name: 'Nuevo' })).rejects.toThrow(new RatePlanArchivedError('La tarifa está archivada.'));
    findPlan.mockResolvedValue(plan()); const failure = new Error('persistence'); update.mockRejectedValueOnce(failure); await expect(subject.execute({ ...input, name: 'Nuevo' })).rejects.toBe(failure);
  });
  it('blocks any final validity that would exclude an existing season before updating', async () => {
    findPlan.mockResolvedValue(plan(RatePlanStatus.ACTIVE, '2026-12-01', '2027-01-06'));
    hasOutsideValidity.mockResolvedValueOnce(true);
    await expect(subject.execute({ ...input, validTo: '2026-12-15' })).rejects.toThrow(new SeasonalRateValidityConflictError('La vigencia de la tarifa no puede excluir temporadas existentes.'));
    expect(hasOutsideValidity).toHaveBeenCalledWith(ratePlanId, '2026-12-01', '2026-12-15');
    expect(update).not.toHaveBeenCalled();

    findPlan.mockResolvedValueOnce(plan(RatePlanStatus.ACTIVE, '2026-12-01', '2027-01-06'));
    hasOutsideValidity.mockResolvedValueOnce(true);
    await expect(subject.execute({ ...input, validFrom: '2026-12-25' })).rejects.toThrow(new SeasonalRateValidityConflictError('La vigencia de la tarifa no puede excluir temporadas existentes.'));
    expect(update).not.toHaveBeenCalled();
  });
  it('permits expanded or open-ended validity when seasons remain included', async () => {
    findPlan.mockResolvedValue(plan(RatePlanStatus.ACTIVE, '2026-12-20', '2027-01-06'));
    await subject.execute({ ...input, validFrom: '2026-07-01', validTo: '2027-01-01' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ validFrom: '2026-07-01', validTo: '2027-01-01' }));
    await subject.execute({ ...input, validTo: null });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ validTo: null }));
  });
});
