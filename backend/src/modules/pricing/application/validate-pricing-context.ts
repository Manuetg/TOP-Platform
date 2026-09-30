import { BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { isValidPricingDate, pricingDateDaysBetween } from '../domain/pricing-date';
import type { PricingResourceLookup } from '../domain/resource.lookup';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumNights = 365;

export class InvalidListRatePlansInputError extends Error {}
export class ListRatePlansBusinessNotFoundError extends Error {}
export class ListRatePlansBusinessArchivedError extends Error {}
export class ListRatePlansResourceNotFoundError extends Error {}
export class ListRatePlansResourceUnavailableError extends Error {}

export interface PricingContextInput {
  businessId: unknown;
  resourceId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
}

export interface PricingSelection {
  resourceId: string;
  checkIn: string;
  checkOut: string;
}

export async function validatePricingContext(
  input: PricingContextInput,
  businesses: BusinessRepository,
  resources: PricingResourceLookup,
  requireSelection = false,
): Promise<{ businessId: string; currency: string; selection: PricingSelection | null }> {
  const businessId = validBusinessId(input.businessId);
  const selection = validSelection(input);
  if (requireSelection && !selection) {
    throw new InvalidListRatePlansInputError('resourceId, checkIn y checkOut son obligatorios.');
  }

  const business = await businesses.findById(businessId);
  if (!business) throw new ListRatePlansBusinessNotFoundError('El negocio no existe.');

  if (selection) {
    if (business.status !== BusinessStatus.ACTIVE) {
      throw new ListRatePlansBusinessArchivedError('El negocio está archivado.');
    }
    const resource = await resources.findByIdAndBusinessId(selection.resourceId, businessId);
    if (!resource) throw new ListRatePlansResourceNotFoundError('El recurso no existe.');
    if (resource.status !== 'ACTIVE') {
      throw new ListRatePlansResourceUnavailableError('El recurso no está disponible para cotización.');
    }
  }

  return { businessId, currency: business.currency, selection };
}

function validBusinessId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new InvalidListRatePlansInputError('El identificador del negocio no es válido.');
  }
  return value;
}

function validSelection(input: PricingContextInput): PricingSelection | null {
  const values = [input.resourceId, input.checkIn, input.checkOut];
  const present = values.filter((value) => value !== undefined).length;
  if (present === 0) return null;
  if (present !== values.length) {
    throw new InvalidListRatePlansInputError('resourceId, checkIn y checkOut deben enviarse juntos.');
  }
  if (typeof input.resourceId !== 'string' || !uuid.test(input.resourceId)) {
    throw new InvalidListRatePlansInputError('El identificador del recurso no es válido.');
  }
  if (!isValidPricingDate(input.checkIn)) {
    throw new InvalidListRatePlansInputError('La fecha de entrada es inválida.');
  }
  if (!isValidPricingDate(input.checkOut)) {
    throw new InvalidListRatePlansInputError('La fecha de salida es inválida.');
  }
  const nights = pricingDateDaysBetween(input.checkIn, input.checkOut);
  if (nights <= 0) {
    throw new InvalidListRatePlansInputError('La fecha de entrada debe ser anterior a la fecha de salida.');
  }
  if (nights > maximumNights) {
    throw new InvalidListRatePlansInputError('La estadía no puede superar 365 noches.');
  }
  return { resourceId: input.resourceId, checkIn: input.checkIn, checkOut: input.checkOut };
}
