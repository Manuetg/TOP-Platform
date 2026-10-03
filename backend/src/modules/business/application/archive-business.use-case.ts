import { Inject, Injectable } from '@nestjs/common';
import type { Business } from '../domain/business.entity';
import { BUSINESS_CHANGE_REPOSITORY, type BusinessChangeRepository } from '../domain/business-change.repository';

@Injectable()
export class ArchiveBusinessUseCase {
  constructor(@Inject(BUSINESS_CHANGE_REPOSITORY) private readonly changes: BusinessChangeRepository) {}

  async execute(id: string, actorUserId: string): Promise<Business> {
    return this.changes.archive({ id, actorUserId });
  }
}
