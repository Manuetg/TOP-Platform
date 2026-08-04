import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository, BusinessStatus } from '../../business/business.contract';
import { Resource, type ResourceUpdate } from '../domain/resource.entity';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import { InvalidBusinessIdError, InvalidResourceIdError, ResourceBusinessNotFoundError, ResourceNotFoundError } from './get-resource.use-case';

export class InvalidResourceUpdateError extends Error {}
export class ResourceBusinessArchivedError extends Error {}
export class ResourceArchivedError extends Error {}
export class ResourceCodeAlreadyExistsError extends Error {}

export interface UpdateResourceInput {
  businessId: string;
  resourceId: string;
  name?: unknown;
  internalCode?: unknown;
  description?: unknown;
  capacityMinimum?: unknown;
  capacityMaximum?: unknown;
  capacityMaximumChildren?: unknown;
  sortOrder?: unknown;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class UpdateResourceUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
  ) {}

  async execute(input: UpdateResourceInput): Promise<Resource> {
    this.validateIds(input);
    this.validateNotEmpty(input);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new ResourceBusinessArchivedError('El negocio está archivado.');
    const resource = await this.resources.findByIdAndBusinessId(input.resourceId, input.businessId);
    if (!resource) throw new ResourceNotFoundError('El recurso no existe.');
    if (resource.status === ResourceStatus.ARCHIVED) throw new ResourceArchivedError('El recurso está archivado.');
    const changes = this.changes(input, resource);
    if (changes.internalCode !== undefined) await this.ensureCodeAvailable(input.businessId, resource.id, changes.internalCode);
    return this.resources.update(resource.update(changes));
  }

  private validateIds(input: UpdateResourceInput): void {
    if (!uuid.test(input.businessId)) throw new InvalidBusinessIdError('El identificador del negocio no es válido.');
    if (!uuid.test(input.resourceId)) throw new InvalidResourceIdError('El identificador del recurso no es válido.');
  }

  private validateNotEmpty(input: UpdateResourceInput): void {
    if (![input.name, input.internalCode, input.description, input.capacityMinimum, input.capacityMaximum, input.capacityMaximumChildren, input.sortOrder].some((value) => value !== undefined)) throw new InvalidResourceUpdateError('Se requiere al menos un campo actualizable.');
  }

  private changes(input: UpdateResourceInput, resource: Resource): ResourceUpdate {
    const changes: ResourceUpdate = { ...this.textChanges(input), ...this.capacityChanges(input, resource) };
    return changes;
  }

  private textChanges(input: UpdateResourceInput): ResourceUpdate {
    const changes: ResourceUpdate = {};
    if (input.name !== undefined) changes.name = this.text(input.name, 'El nombre es inválido.', 2, 120);
    if (input.internalCode !== undefined) changes.internalCode = this.code(input.internalCode);
    if (input.description !== undefined) changes.description = this.description(input.description);
    return changes;
  }

  private capacityChanges(input: UpdateResourceInput, resource: Resource): ResourceUpdate {
    const changes: ResourceUpdate = {};
    const minimum = input.capacityMinimum === undefined ? resource.capacityMinimum : this.integer(input.capacityMinimum, 'La capacidad mínima es inválida.', 1, 50);
    const maximum = input.capacityMaximum === undefined ? resource.capacityMaximum : this.integer(input.capacityMaximum, 'La capacidad máxima debe ser un entero entre 1 y 50.', 1, 50);
    const children = input.capacityMaximumChildren === undefined ? resource.capacityMaximumChildren : this.integer(input.capacityMaximumChildren, 'La capacidad máxima de menores es inválida.', 0, 50);
    if (minimum > maximum) throw new InvalidResourceUpdateError('La capacidad mínima no puede superar la capacidad máxima.');
    if (children > maximum) throw new InvalidResourceUpdateError('La capacidad máxima de menores no puede superar la capacidad máxima.');
    if (input.capacityMinimum !== undefined) changes.capacityMinimum = minimum;
    if (input.capacityMaximum !== undefined) changes.capacityMaximum = maximum;
    if (input.capacityMaximumChildren !== undefined) changes.capacityMaximumChildren = children;
    if (input.sortOrder !== undefined) changes.sortOrder = this.integer(input.sortOrder, 'El orden es inválido.', 0, 9999);
    return changes;
  }

  private text(value: unknown, message: string, minimum: number, maximum: number): string { if (typeof value !== 'string') throw new InvalidResourceUpdateError(message); const text = value.trim(); if (text.length < minimum || text.length > maximum) throw new InvalidResourceUpdateError(message); return text; }
  private code(value: unknown): string { const code = this.text(value, 'El código interno es inválido.', 2, 30).toUpperCase(); if (!/^[A-Z0-9_-]+$/.test(code)) throw new InvalidResourceUpdateError('El código interno es inválido.'); return code; }
  private description(value: unknown): string | null { if (value === null) return null; if (typeof value !== 'string' || value.trim().length > 500) throw new InvalidResourceUpdateError('La descripción es inválida.'); return value.trim() || null; }
  private integer(value: unknown, message: string, minimum: number, maximum: number): number { if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new InvalidResourceUpdateError(message); return value; }
  private async ensureCodeAvailable(businessId: string, resourceId: string, code: string): Promise<void> { const existing = await this.resources.findByBusinessAndCode(businessId, code); if (existing && existing.id !== resourceId) throw new ResourceCodeAlreadyExistsError('El código interno ya existe.'); }
}
