import { Injectable } from '@nestjs/common';
import { MessagingAutomationType } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { MessagingAutomationRule, MessagingAutomationRuleRepository } from '../domain/messaging-automation-rule.repository';
import { MessagingAutomationType as DomainMessagingAutomationType } from '../domain/messaging-automation-type.enum';

@Injectable()
export class PrismaMessagingAutomationRuleRepository implements MessagingAutomationRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBusinessId(businessId: string): Promise<MessagingAutomationRule[]> {
    const rows = await this.prisma.messagingAutomationRule.findMany({ where: { businessId }, orderBy: { automationType: 'asc' } });
    return rows.map(mapRule);
  }

  async findByBusinessAndType(businessId: string, automationType: DomainMessagingAutomationType): Promise<MessagingAutomationRule | null> {
    const row = await this.prisma.messagingAutomationRule.findUnique({ where: { businessId_automationType: { businessId, automationType } } });
    return row ? mapRule(row) : null;
  }

  async save(input: { businessId: string; automationType: DomainMessagingAutomationType; enabled: boolean; templateId: string | null }): Promise<MessagingAutomationRule> {
    const row = await this.prisma.messagingAutomationRule.upsert({
      where: { businessId_automationType: { businessId: input.businessId, automationType: input.automationType } },
      create: input,
      update: { enabled: input.enabled, templateId: input.templateId },
    });
    return mapRule(row);
  }
}

function mapRule(row: { id: string; businessId: string; automationType: MessagingAutomationType; enabled: boolean; templateId: string | null; createdAt: Date; updatedAt: Date }): MessagingAutomationRule {
  return { ...row, automationType: row.automationType as DomainMessagingAutomationType };
}
