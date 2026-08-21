import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { AvailabilityBusinessNotFoundError, InvalidAvailabilityInputError } from './availability.errors';
import { assertAvailabilityUuid } from './availability.validation';
import { AVAILABILITY_RULES_REPOSITORY, DEFAULT_AVAILABILITY_RULES, type AvailabilityRules, type AvailabilityRulesRepository } from '../domain/availability-rules.repository';

export interface UpdateAvailabilityRulesInput {
  businessId: string;
  pendingBlocksAvailability?: unknown;
  bufferBeforeDays?: unknown;
  bufferAfterDays?: unknown;
}

@Injectable()
export class GetAvailabilityRulesUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(AVAILABILITY_RULES_REPOSITORY) private readonly rules: AvailabilityRulesRepository) {}
  async execute(businessId: string): Promise<AvailabilityRules> {
    assertAvailabilityUuid(businessId);
    if (!await this.businesses.findById(businessId)) throw new AvailabilityBusinessNotFoundError('El negocio no existe.');
    return await this.rules.findByBusinessId(businessId) ?? { businessId, ...DEFAULT_AVAILABILITY_RULES };
  }
}

@Injectable()
export class UpdateAvailabilityRulesUseCase {
  constructor(private readonly get: GetAvailabilityRulesUseCase, @Inject(AVAILABILITY_RULES_REPOSITORY) private readonly rules: AvailabilityRulesRepository) {}
  async execute(input: UpdateAvailabilityRulesInput): Promise<AvailabilityRules> {
    const present = input.pendingBlocksAvailability !== undefined || input.bufferBeforeDays !== undefined || input.bufferAfterDays !== undefined;
    if (!present) throw new InvalidAvailabilityInputError('Debe informar al menos una regla.');
    const current = await this.get.execute(input.businessId);
    const pendingBlocksAvailability = input.pendingBlocksAvailability === undefined ? current.pendingBlocksAvailability : this.boolean(input.pendingBlocksAvailability);
    const bufferBeforeDays = input.bufferBeforeDays === undefined ? current.bufferBeforeDays : this.days(input.bufferBeforeDays);
    const bufferAfterDays = input.bufferAfterDays === undefined ? current.bufferAfterDays : this.days(input.bufferAfterDays);
    return this.rules.save({ businessId: input.businessId, pendingBlocksAvailability, bufferBeforeDays, bufferAfterDays });
  }
  private boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new InvalidAvailabilityInputError('La regla PENDING es inválida.'); return value; }
  private days(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidAvailabilityInputError('El buffer es inválido.'); return value; }
}
