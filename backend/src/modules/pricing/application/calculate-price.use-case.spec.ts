import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { PricingCalculator } from '../domain/pricing-calculator';
import { RatePlan } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { SeasonalRate } from '../domain/seasonal-rate.entity';
import { ResourceStatus } from '../../resource/domain/resource-status.enum';
import { CalculatePriceUseCase } from './calculate-price.use-case';
import { InvalidCalculatePriceInputError } from './calculate-price.errors';

const businessId='11111111-1111-4111-8111-111111111111'; const planId='22222222-2222-4222-8222-222222222222'; const resourceId='33333333-3333-4333-8333-333333333333';
const business=()=>Business.create({id:businessId,businessNumber:null,name:'TOP',legalName:null,taxId:null,timezone:'America/Asuncion',currency:'PYG',status:BusinessStatus.ACTIVE,createdAt:new Date(),updatedAt:new Date()});
const plan=()=>RatePlan.create({id:planId,businessId,name:'Plan',description:null,baseNightlyAmountMinor:450000,currency:'PYG',status:RatePlanStatus.ACTIVE,validFrom:null,validTo:null,resources:[],createdAt:new Date(),updatedAt:new Date()});
const season=()=>SeasonalRate.create({id:'44444444-4444-4444-8444-444444444444',ratePlanId:planId,name:'Navidad',amountMinor:650000,currency:'PYG',startDate:'2026-12-20',endDate:'2027-01-06',createdAt:new Date(),updatedAt:new Date()});

describe('CalculatePriceUseCase',()=>{
  const findBusiness=jest.fn(); const findResource=jest.fn(); const findPlan=jest.fn(); const isAssigned=jest.fn(); const listIntersectingRange=jest.fn();
  const subject=new CalculatePriceUseCase({findById:findBusiness,create:jest.fn(),list:jest.fn(),update:jest.fn()},{findByIdAndBusinessId:findResource},{create:jest.fn(),findByIdAndBusinessId:findPlan,update:jest.fn()},{isAssigned},{create:jest.fn(),listByRatePlanId:jest.fn(),listIntersectingRange,hasOverlap:jest.fn(),hasOutsideValidity:jest.fn()},new PricingCalculator());
  const input={businessId,ratePlanId:planId,resourceId,checkIn:'2026-12-18',checkOut:'2026-12-22'};
  beforeEach(()=>{jest.resetAllMocks();findBusiness.mockResolvedValue(business());findResource.mockResolvedValue({id:resourceId,businessId,status:ResourceStatus.ACTIVE});findPlan.mockResolvedValue(plan());isAssigned.mockResolvedValue(true);listIntersectingRange.mockResolvedValue([season()]);});
  it('calculates an assigned stay using one intersecting seasonal query',async()=>{const result=await subject.execute(input);expect(listIntersectingRange).toHaveBeenCalledWith(planId,'2026-12-18','2026-12-22');expect(result).toMatchObject({nights:4,totalAmountMinor:2200000,currency:'PYG'});});
  it.each([{...input,checkIn:'2026-02-30'},{...input,checkIn:'2026-12-22',checkOut:'2026-12-22'},{...input,checkOut:'2027-12-20'}])('rejects invalid stays before lookups',async(value)=>{await expect(subject.execute(value)).rejects.toBeInstanceOf(InvalidCalculatePriceInputError);expect(findBusiness).not.toHaveBeenCalled();});
  it('rejects an unassigned RatePlan with its business message',async()=>{isAssigned.mockResolvedValueOnce(false);await expect(subject.execute(input)).rejects.toThrow('La tarifa no está asignada al recurso.');expect(listIntersectingRange).not.toHaveBeenCalled();});
  it.each([
    [{ ...input, businessId: 'invalid' }, 'El identificador del negocio no es válido.'],
    [{ ...input, ratePlanId: 'invalid' }, 'El identificador de la tarifa no es válido.'],
    [{ ...input, resourceId: 'invalid' }, 'El identificador del recurso no es válido.'],
    [{ ...input, checkOut: '2026-04-31' }, 'La fecha de salida es inválida.'],
    [{ ...input, checkOut: '2027-12-19' }, 'La estadía no puede superar 365 noches.'],
  ])('rejects syntactically invalid input before every lookup', async (value, message) => {
    await expect(subject.execute(value)).rejects.toMatchObject({ message });
    expect(findBusiness).not.toHaveBeenCalled(); expect(findResource).not.toHaveBeenCalled();
    expect(findPlan).not.toHaveBeenCalled(); expect(isAssigned).not.toHaveBeenCalled();
  });
  it('allows exactly 365 nights and queries the complete range once', async () => {
    listIntersectingRange.mockResolvedValueOnce([]);
    const result = await subject.execute({ ...input, checkIn: '2026-01-01', checkOut: '2027-01-01' });
    expect(result.nights).toBe(365);
    expect(listIntersectingRange).toHaveBeenCalledWith(planId, '2026-01-01', '2027-01-01');
  });
  it.each([
    [null, 'El negocio no existe.'],
    [Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ARCHIVED, createdAt: new Date(), updatedAt: new Date() }), 'El negocio está archivado.'],
  ])('stops after a missing or archived Business', async (found, message) => {
    findBusiness.mockResolvedValueOnce(found);
    await expect(subject.execute(input)).rejects.toThrow(message);
    expect(findResource).not.toHaveBeenCalled(); expect(findPlan).not.toHaveBeenCalled();
  });
  it.each([
    [null, 'El recurso no existe.'],
    [{ id: resourceId, businessId, status: ResourceStatus.OUT_OF_SERVICE }, 'El recurso no está disponible para cotización.'],
    [{ id: resourceId, businessId, status: ResourceStatus.ARCHIVED }, 'El recurso no está disponible para cotización.'],
  ])('rejects an unavailable or missing Resource without loading the plan', async (found, message) => {
    findResource.mockResolvedValueOnce(found);
    await expect(subject.execute(input)).rejects.toThrow(message);
    expect(findPlan).not.toHaveBeenCalled(); expect(isAssigned).not.toHaveBeenCalled();
  });
  it.each([
    [null, 'La tarifa no existe.'],
    [RatePlan.create({ id: planId, businessId, name: 'Plan', description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', status: RatePlanStatus.ARCHIVED, validFrom: null, validTo: null, resources: [], createdAt: new Date(), updatedAt: new Date() }), 'La tarifa está archivada.'],
  ])('rejects an unavailable or missing RatePlan before assignment lookup', async (found, message) => {
    findPlan.mockResolvedValueOnce(found);
    await expect(subject.execute(input)).rejects.toThrow(message);
    expect(isAssigned).not.toHaveBeenCalled(); expect(listIntersectingRange).not.toHaveBeenCalled();
  });
  it.each([
    [{ validFrom: '2026-12-19', validTo: null }, { ...input }],
    [{ validFrom: null, validTo: '2026-12-21' }, { ...input }],
  ])('rejects stays outside RatePlan validity', async (validity, value) => {
    const current = plan();
    findPlan.mockResolvedValueOnce(RatePlan.create({ id: current.id, businessId: current.businessId, name: current.name, description: current.description, baseNightlyAmountMinor: current.baseNightlyAmountMinor, currency: current.currency, status: current.status, validFrom: validity.validFrom, validTo: validity.validTo, resources: [], createdAt: current.createdAt, updatedAt: current.updatedAt }));
    await expect(subject.execute(value)).rejects.toThrow('La estadía está fuera de la vigencia de la tarifa.');
    expect(listIntersectingRange).not.toHaveBeenCalled();
  });
  it('allows stays exactly on RatePlan validity borders', async () => {
    const current = plan();
    findPlan.mockResolvedValueOnce(RatePlan.create({ id: current.id, businessId: current.businessId, name: current.name, description: current.description, baseNightlyAmountMinor: current.baseNightlyAmountMinor, currency: current.currency, status: current.status, validFrom: '2026-12-18', validTo: '2026-12-22', resources: [], createdAt: current.createdAt, updatedAt: current.updatedAt }));
    await expect(subject.execute(input)).resolves.toMatchObject({ totalAmountMinor: 2200000 });
  });
  it('allows a stay strictly inside both validity limits', async () => {
    const current = plan();
    findPlan.mockResolvedValueOnce(RatePlan.create({ id: current.id, businessId: current.businessId, name: current.name, description: current.description, baseNightlyAmountMinor: current.baseNightlyAmountMinor, currency: current.currency, status: current.status, validFrom: '2026-12-17', validTo: '2026-12-23', resources: [], createdAt: current.createdAt, updatedAt: current.updatedAt }));
    await expect(subject.execute(input)).resolves.toMatchObject({ nights: 4 });
  });
  it('uses exact messages for lookup state errors', async () => {
    findBusiness.mockResolvedValueOnce(null); await expect(subject.execute(input)).rejects.toThrow('El negocio no existe.');
    findResource.mockResolvedValueOnce(null); await expect(subject.execute(input)).rejects.toThrow('El recurso no existe.');
    findPlan.mockResolvedValueOnce(null); await expect(subject.execute(input)).rejects.toThrow('La tarifa no existe.');
  });
  it('propagates repository failures without converting them', async () => {
    const failure = new Error('database unavailable'); findBusiness.mockRejectedValueOnce(failure);
    await expect(subject.execute(input)).rejects.toBe(failure);
  });
});
