import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { MessagingSettings, MessagingSettingsRepository } from '../domain/messaging-settings.repository';

@Injectable()
export class PrismaMessagingSettingsRepository implements MessagingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByBusinessId(businessId: string): Promise<MessagingSettings | null> {
    return this.prisma.messagingSettings.findUnique({ where: { businessId } });
  }

  save(input: { businessId: string; botEnabled: boolean }): Promise<MessagingSettings> {
    return this.prisma.messagingSettings.upsert({
      where: { businessId: input.businessId },
      create: input,
      update: { botEnabled: input.botEnabled },
    });
  }
}
