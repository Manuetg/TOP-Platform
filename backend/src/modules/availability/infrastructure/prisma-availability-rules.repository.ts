import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { AvailabilityRules, AvailabilityRulesRepository } from '../domain/availability-rules.repository';

@Injectable()
export class PrismaAvailabilityRulesRepository implements AvailabilityRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBusinessId(businessId: string): Promise<AvailabilityRules | null> {
    return this.prisma.availabilityRule.findUnique({ where: { businessId } });
  }

  async save(rules: AvailabilityRules): Promise<AvailabilityRules> {
    return this.prisma.availabilityRule.upsert({
      where: { businessId: rules.businessId },
      create: rules,
      update: {
        pendingBlocksAvailability: rules.pendingBlocksAvailability,
        bufferBeforeDays: rules.bufferBeforeDays,
        bufferAfterDays: rules.bufferAfterDays,
      },
    });
  }
}
