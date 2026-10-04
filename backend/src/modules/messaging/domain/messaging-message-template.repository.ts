import { MessagingChannel } from './messaging-channel.enum';
import { MessagingAutomationType } from './messaging-automation-type.enum';

export interface MessagingMessageTemplate {
  id: string;
  businessId: string;
  templateType: MessagingAutomationType;
  channel: MessagingChannel;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MESSAGING_MESSAGE_TEMPLATE_REPOSITORY = Symbol('MESSAGING_MESSAGE_TEMPLATE_REPOSITORY');

export interface MessagingMessageTemplateRepository {
  findByBusinessId(businessId: string): Promise<MessagingMessageTemplate[]>;
  findByIdAndBusinessId(id: string, businessId: string): Promise<MessagingMessageTemplate | null>;
  findByBusinessTypeAndChannel(businessId: string, templateType: MessagingAutomationType, channel: MessagingChannel): Promise<MessagingMessageTemplate | null>;
  save(input: { businessId: string; templateType: MessagingAutomationType; channel: MessagingChannel; content: string }): Promise<MessagingMessageTemplate>;
}
