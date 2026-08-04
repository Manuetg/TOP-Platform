import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository, BusinessStatus } from '../../business/business.contract';
import { Resource } from '../domain/resource.entity';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';

export class InvalidResourceInputError extends Error {}
export class ResourceBusinessNotFoundError extends Error {}
export class ResourceBusinessUnavailableError extends Error {}
export class ResourceCodeAlreadyExistsError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CreateResourceUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository) {}
  async execute(input: { businessId: string; name?: unknown; internalCode?: unknown; description?: unknown; capacityMinimum?: unknown; capacityMaximum?: unknown; capacityMaximumChildren?: unknown; sortOrder?: unknown }): Promise<Resource> {
    if (!uuid.test(input.businessId)) throw new InvalidResourceInputError('El identificador del negocio no es válido.');
    const name = this.text(input.name, 'El nombre es obligatorio.', 2, 120);
    const internalCode = this.code(input.internalCode);
    const capacityMaximum = this.requiredInteger(input.capacityMaximum, 'La capacidad máxima debe ser un entero entre 1 y 50.', 1, 50);
    const capacityMinimum = this.optionalInteger(input.capacityMinimum, 1, 'La capacidad mínima es inválida.', 1, capacityMaximum);
    const capacityMaximumChildren = this.optionalInteger(input.capacityMaximumChildren, 0, 'La capacidad máxima de menores es inválida.', 0, capacityMaximum);
    const sortOrder = this.optionalInteger(input.sortOrder, 0, 'El orden es inválido.', 0, 9999);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ResourceBusinessUnavailableError('El negocio no está activo.');
    if (await this.resources.findByBusinessAndCode(input.businessId, internalCode)) throw new ResourceCodeAlreadyExistsError('El código interno ya existe.');
    return this.resources.create({ businessId: input.businessId, name, internalCode, description: this.description(input.description), capacityMinimum, capacityMaximum, capacityMaximumChildren, sortOrder });
  }
  private text(value: unknown, message: string, minimum: number, maximum: number): string { if (typeof value !== 'string') throw new InvalidResourceInputError(message); const text = value.trim(); if (text.length < minimum || text.length > maximum) throw new InvalidResourceInputError(message); return text; }
  private code(value: unknown): string { const code = this.text(value, 'El código interno es inválido.', 2, 30).toUpperCase(); if (!/^[A-Z0-9_-]+$/.test(code)) throw new InvalidResourceInputError('El código interno es inválido.'); return code; }
  private requiredInteger(value: unknown, message: string, minimum: number, maximum: number): number { if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new InvalidResourceInputError(message); return value; }
  private optionalInteger(value: unknown, defaultValue: number, message: string, minimum: number, maximum: number): number { if (value === undefined) return defaultValue; return this.requiredInteger(value, message, minimum, maximum); }
  private description(value: unknown): string | null { if (value === undefined || value === null) return null; if (typeof value !== 'string' || value.trim().length > 500) throw new InvalidResourceInputError('La descripción es inválida.'); return value.trim() || null; }
}
