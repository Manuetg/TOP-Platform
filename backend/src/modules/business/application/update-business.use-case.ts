import { Inject, Injectable } from '@nestjs/common';
import { type BusinessUpdate, Business } from '../domain/business.entity';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../domain/business.repository';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

export class InvalidBusinessUpdateError extends Error {}

@Injectable()
export class UpdateBusinessUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businessRepository: BusinessRepository) {}

  async execute(id: string, request: BusinessUpdate): Promise<Business> {
    const changes = this.validate(request);
    const business = await this.businessRepository.findById(id);

    if (!business) {
      throw new BusinessNotFoundError('El negocio no existe.');
    }

    return this.businessRepository.update(business.update(changes));
  }

  private validate(request: BusinessUpdate): BusinessUpdate {
    this.validateRequestNotEmpty(request);
    const changes: BusinessUpdate = {};
    const name = this.validateName(request.name); if (name !== undefined) changes.name = name;
    if (request.legalName !== undefined) changes.legalName = this.normalizeOptional(request.legalName);
    if (request.taxId !== undefined) changes.taxId = this.normalizeOptional(request.taxId);
    const timezone = this.validateTimezone(request.timezone); if (timezone !== undefined) changes.timezone = timezone;
    const currency = this.validateCurrency(request.currency); if (currency !== undefined) changes.currency = currency;
    return changes;
  }

  private validateRequestNotEmpty(request: BusinessUpdate): void {
    const hasUpdate = Object.values(request).some((value) => value !== undefined);

    if (!hasUpdate) throw new InvalidBusinessUpdateError('Se requiere al menos un campo actualizable.');
  }
  private validateName(value: string | undefined): string | undefined { if (value === undefined) return undefined; const name = value.trim(); if (!name) throw new InvalidBusinessUpdateError('El nombre del negocio es obligatorio.'); if (name.length > 120) throw new InvalidBusinessUpdateError('El nombre del negocio no puede superar los 120 caracteres.'); return name; }
  private normalizeOptional(value: string | null): string | null { return typeof value === 'string' ? value.trim() : null; }
  private validateTimezone(value: string | undefined): string | undefined { if (value === undefined) return undefined; try { Intl.DateTimeFormat(undefined, { timeZone: value }); } catch { throw new InvalidBusinessUpdateError('La zona horaria no es válida.'); } return value; }
  private validateCurrency(value: string | undefined): string | undefined { if (value === undefined) return undefined; if (value !== 'PYG') throw new InvalidBusinessUpdateError('La moneda debe ser PYG.'); return value; }
}
