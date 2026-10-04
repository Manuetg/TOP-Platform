import { Injectable } from '@nestjs/common';
import { MessagingChannel, MessagingTemplateType } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { MessagingMessageTemplate, MessagingMessageTemplateRepository } from '../domain/messaging-message-template.repository';
import { MessagingChannel as DomainMessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';

@Injectable()
export class PrismaMessagingMessageTemplateRepository implements MessagingMessageTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBusinessId(businessId: string): Promise<MessagingMessageTemplate[]> {
    const rows = await this.prisma.messagingMessageTemplate.findMany({ where: { businessId }, orderBy: [{ templateType: 'asc' }, { channel: 'asc' }] });
    return rows.map(mapTemplate);
  }

  async findByIdAndBusinessId(id: string, businessId: string): Promise<MessagingMessageTemplate | null> {
    const row = await this.prisma.messagingMessageTemplate.findFirst({ where: { id, businessId } });
    return row ? mapTemplate(row) : null;
  }

  async findByBusinessTypeAndChannel(businessId: string, templateType: MessagingAutomationType, channel: DomainMessagingChannel): Promise<MessagingMessageTemplate | null> {
    const row = await this.prisma.messagingMessageTemplate.findUnique({ where: { businessId_templateType_channel: { businessId, templateType, channel } } });
    return row ? mapTemplate(row) : null;
  }

  async save(input: { businessId: string; templateType: MessagingAutomationType; channel: DomainMessagingChannel; content: string }): Promise<MessagingMessageTemplate> {
    const row = await this.prisma.messagingMessageTemplate.upsert({
      where: { businessId_templateType_channel: { businessId: input.businessId, templateType: input.templateType, channel: input.channel } },
      create: input,
      update: { content: input.content },
    });
    return mapTemplate(row);
  }
}

function mapTemplate(row: { id: string; businessId: string; templateType: MessagingTemplateType; channel: MessagingChannel; content: string; createdAt: Date; updatedAt: Date }): MessagingMessageTemplate {
  return { ...row, templateType: row.templateType as MessagingAutomationType, channel: row.channel as DomainMessagingChannel };
}
