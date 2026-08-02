import { Inject, Injectable } from '@nestjs/common';
import { Business } from '../domain/business.entity';
import { BusinessStatus } from '../domain/business-status.enum';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../domain/business.repository';
import { BusinessNotFoundError } from './get-business-by-id.use-case';

@Injectable()
export class ArchiveBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businessRepository: BusinessRepository,
  ) {}

  async execute(id: string): Promise<Business> {
    const business = await this.businessRepository.findById(id);

    if (!business) {
      throw new BusinessNotFoundError('El negocio no existe.');
    }

    if (business.status === BusinessStatus.ARCHIVED) {
      return business;
    }

    return this.businessRepository.update(business.archive());
  }
}
