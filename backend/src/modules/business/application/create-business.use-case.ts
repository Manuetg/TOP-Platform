import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository, type CreateBusinessData } from '../domain/business.repository';
import { Business } from '../domain/business.entity';

export class InvalidBusinessNameError extends Error {}

@Injectable()
export class CreateBusinessUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businessRepository: BusinessRepository) {}

  async execute(data: CreateBusinessData): Promise<Business> {
    const name = data.name?.trim();

    if (!name) {
      throw new InvalidBusinessNameError('El nombre del negocio es obligatorio.');
    }

    if (name.length > 120) {
      throw new InvalidBusinessNameError('El nombre del negocio no puede superar los 120 caracteres.');
    }

    return this.businessRepository.create({ ...data, name });
  }
}
