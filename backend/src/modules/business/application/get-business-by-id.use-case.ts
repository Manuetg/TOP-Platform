import { Inject, Injectable } from '@nestjs/common';
import { Business } from '../domain/business.entity';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../domain/business.repository';

export class BusinessNotFoundError extends Error {}

@Injectable()
export class GetBusinessByIdUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businessRepository: BusinessRepository,
  ) {}

  async execute(id: string): Promise<Business> {
    const business = await this.businessRepository.findById(id);

    if (!business) {
      throw new BusinessNotFoundError('El negocio no existe.');
    }

    return business;
  }
}
