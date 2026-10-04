import { Inject, Injectable } from '@nestjs/common';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';
import { MESSAGING_AUTOMATION_RULE_REPOSITORY, type MessagingAutomationRuleRepository } from '../domain/messaging-automation-rule.repository';
import { MESSAGING_MESSAGE_TEMPLATE_REPOSITORY, type MessagingMessageTemplateRepository } from '../domain/messaging-message-template.repository';
import { DEFAULT_MESSAGING_TEMPLATES } from './messaging-template.defaults';

export interface ResolvedMessagingAutomation {
  businessId: string;
  automationType: MessagingAutomationType;
  enabled: boolean;
  templateType: MessagingAutomationType;
  content: string;
}

export const MESSAGING_AUTOMATION_CONFIGURATION = Symbol('MESSAGING_AUTOMATION_CONFIGURATION');

export interface MessagingAutomationConfigurationReader {
  resolve(input: { businessId: string; automationType: MessagingAutomationType; channel: MessagingChannel }): Promise<ResolvedMessagingAutomation>;
}

@Injectable()
export class MessagingAutomationConfigurationService implements MessagingAutomationConfigurationReader {
  constructor(
    @Inject(MESSAGING_AUTOMATION_RULE_REPOSITORY) private readonly rules: MessagingAutomationRuleRepository,
    @Inject(MESSAGING_MESSAGE_TEMPLATE_REPOSITORY) private readonly templates: MessagingMessageTemplateRepository,
  ) {}

  async resolve(input: { businessId: string; automationType: MessagingAutomationType; channel: MessagingChannel }): Promise<ResolvedMessagingAutomation> {
    const rule = await this.rules.findByBusinessAndType(input.businessId, input.automationType);
    if (rule && !rule.enabled) return { ...input, enabled: false, templateType: input.automationType, content: DEFAULT_MESSAGING_TEMPLATES[input.automationType] };
    if (!rule || !rule.templateId) return { ...input, enabled: true, templateType: input.automationType, content: DEFAULT_MESSAGING_TEMPLATES[input.automationType] };
    const template = await this.templates.findByIdAndBusinessId(rule.templateId, input.businessId);
    if (!template || template.templateType !== input.automationType || template.channel !== input.channel) throw new Error('La plantilla de la automatización no existe o no pertenece al Business.');
    return { ...input, enabled: true, templateType: template.templateType, content: template.content };
  }
}
