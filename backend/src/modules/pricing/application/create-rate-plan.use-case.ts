import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { RatePlan } from '../domain/rate-plan.entity';
import { RATE_PLAN_REPOSITORY, type RatePlanRepository } from '../domain/rate-plan.repository';
import { PRICING_RESOURCE_LOOKUP, type PricingResourceLookup } from '../domain/resource.lookup';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
export class InvalidRatePlanInputError extends Error {}
export class RatePlanBusinessNotFoundError extends Error {}
export class RatePlanBusinessArchivedError extends Error {}
export class RatePlanResourceNotFoundError extends Error {}
export class RatePlanResourceArchivedError extends Error {}
export interface CreateRatePlanInput { businessId: string; name?: unknown; description?: unknown; baseNightlyAmountMinor?: unknown; validFrom?: unknown; validTo?: unknown; resourceIds?: unknown; }

@Injectable()
export class CreateRatePlanUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(PRICING_RESOURCE_LOOKUP) private readonly resources: PricingResourceLookup, @Inject(RATE_PLAN_REPOSITORY) private readonly ratePlans: RatePlanRepository) {}
  async execute(input: CreateRatePlanInput): Promise<RatePlan> {
    if (!uuid.test(input.businessId)) throw new InvalidRatePlanInputError('El identificador del negocio no es válido.');
    const name = this.name(input.name); const description = this.description(input.description); const baseNightlyAmountMinor = this.amount(input.baseNightlyAmountMinor); const { validFrom, validTo } = this.dates(input.validFrom, input.validTo); const resourceIds = this.resourceIds(input.resourceIds);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new RatePlanBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new RatePlanBusinessArchivedError('El negocio está archivado.');
    await this.validateResources(input.businessId, resourceIds);
    return this.ratePlans.create({ businessId: input.businessId, name, description, baseNightlyAmountMinor, currency: business.currency, validFrom, validTo, resourceIds });
  }
  private name(value: unknown): string { if (typeof value !== 'string') throw new InvalidRatePlanInputError('El nombre de la tarifa es obligatorio.'); const text = value.trim(); if (text.length < 2 || text.length > 120) throw new InvalidRatePlanInputError('El nombre de la tarifa debe tener entre 2 y 120 caracteres.'); return text; }
  private description(value: unknown): string | null { if (value === undefined || value === null) return null; if (typeof value !== 'string' || value.trim().length > 500) throw new InvalidRatePlanInputError('La descripción es inválida.'); return value.trim() || null; }
  private amount(value: unknown): number { if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 2147483647) throw new InvalidRatePlanInputError('La tarifa base por noche debe ser un entero positivo válido.'); return value; }
  private dates(from: unknown, to: unknown): { validFrom: string | null; validTo: string | null } { const validFrom = this.date(from, 'La fecha de inicio es inválida.'); const validTo = this.date(to, 'La fecha de fin es inválida.'); if (validFrom && validTo && validFrom >= validTo) throw new InvalidRatePlanInputError('La fecha de inicio debe ser anterior a la fecha de fin.'); return { validFrom, validTo }; }
  private date(value: unknown, message: string): string | null { if (value === undefined || value === null) return null; if (typeof value !== 'string' || !date.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw new InvalidRatePlanInputError(message); const parsed = new Date(`${value}T00:00:00.000Z`); if (parsed.toISOString().slice(0, 10) !== value) throw new InvalidRatePlanInputError(message); return value; }
  private resourceIds(value: unknown): string[] { if (!Array.isArray(value)) throw new InvalidRatePlanInputError('La lista de Resources es obligatoria.'); const ids: string[] = []; for (const valueId of value) { if (typeof valueId !== 'string' || !uuid.test(valueId)) throw new InvalidRatePlanInputError('Los identificadores de Resources deben ser UUID válidos.'); ids.push(valueId); } if (new Set(ids).size !== ids.length) throw new InvalidRatePlanInputError('La lista de Resources no puede contener duplicados.'); return ids; }
  private async validateResources(businessId: string, resourceIds: string[]): Promise<void> { for (const resourceId of resourceIds) { const resource = await this.resources.findByIdAndBusinessId(resourceId, businessId); if (!resource) throw new RatePlanResourceNotFoundError('El recurso no existe.'); if (resource.status === 'ARCHIVED') throw new RatePlanResourceArchivedError('El recurso está archivado.'); } }
}
