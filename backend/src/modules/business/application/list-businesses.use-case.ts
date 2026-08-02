import { Inject, Injectable } from '@nestjs/common';
import { Business } from '../domain/business.entity';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../domain/business.repository';

@Injectable()
export class ListBusinessesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businessRepository: BusinessRepository,
  ) {}

  async execute(): Promise<Business[]> {
    return this.businessRepository.list();
  }
}
