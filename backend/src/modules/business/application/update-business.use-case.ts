import { Inject, Injectable } from '@nestjs/common';
import { type BusinessUpdate, Business } from '../domain/business.entity';
import { BUSINESS_CHANGE_REPOSITORY, type BusinessChangeRepository } from '../domain/business-change.repository';

export class InvalidBusinessUpdateError extends Error {}
export type BusinessUpdateRequest = BusinessUpdate & { expectedUpdatedAt?: unknown };

@Injectable()
export class UpdateBusinessUseCase {
  constructor(@Inject(BUSINESS_CHANGE_REPOSITORY) private readonly changes: BusinessChangeRepository) {}

  async execute(id: string, request: BusinessUpdateRequest, actorUserId: string): Promise<Business> {
    const changes = this.validate(request);
    const expectedUpdatedAt = this.parseVersion(request.expectedUpdatedAt);
    return this.changes.changeProfile({ id, actorUserId, changes, expectedUpdatedAt });
  }

  private validate(request: BusinessUpdateRequest): BusinessUpdate {
    const changes: BusinessUpdate = {};
    if (request.name !== undefined) changes.name = this.validateName(request.name);
    if (request.legalName !== undefined) changes.legalName = this.normalizeOptional(request.legalName);
    if (request.taxId !== undefined) changes.taxId = this.normalizeOptional(request.taxId);
    for (const field of ['country', 'region', 'city', 'address'] as const) {
      if (request[field] !== undefined) changes[field] = this.normalizeLocation(request[field], field === 'address' ? 500 : 120);
    }
    if (request.timezone !== undefined) changes.timezone = this.validateTimezone(request.timezone);
    if (request.currency !== undefined) changes.currency = this.validateCurrency(request.currency);
    if (Object.keys(changes).length === 0) throw new InvalidBusinessUpdateError('Se requiere al menos un campo actualizable.');
    return changes;
  }

  private validateName(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new InvalidBusinessUpdateError('El nombre del negocio es obligatorio.');
    const name = value.trim();
    if (name.length > 120) throw new InvalidBusinessUpdateError('El nombre del negocio no puede superar los 120 caracteres.');
    return name;
  }

  private validateCurrency(value: unknown): 'PYG' {
    if (value !== 'PYG') throw new InvalidBusinessUpdateError('La moneda debe ser PYG.');
    return value;
  }

  private normalizeOptional(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new InvalidBusinessUpdateError('Los campos opcionales deben ser texto o null.');
    return value.trim() || null;
  }

  private normalizeLocation(value: unknown, limit: number): string | null {
    const normalized = this.normalizeOptional(value);
    if (normalized && normalized.length > limit) throw new InvalidBusinessUpdateError(`El campo de ubicación no puede superar ${limit} caracteres.`);
    return normalized;
  }

  private validateTimezone(value: unknown): string {
    if (typeof value !== 'string') throw new InvalidBusinessUpdateError('La zona horaria no es válida.');
    try { Intl.DateTimeFormat(undefined, { timeZone: value }); } catch { throw new InvalidBusinessUpdateError('La zona horaria no es válida.'); }
    return value;
  }

  private parseVersion(value: unknown): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      throw new InvalidBusinessUpdateError('La versión del establecimiento debe ser el updatedAt vigente en formato ISO UTC con milisegundos.');
    }
    const version = new Date(value);
    if (!Number.isFinite(version.getTime()) || version.toISOString() !== value) throw new InvalidBusinessUpdateError('La versión del establecimiento no es válida.');
    return version;
  }
}
