import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';
import { MESSAGING_SETTINGS_REPOSITORY, type MessagingSettings, type MessagingSettingsRepository } from '../domain/messaging-settings.repository';
import { MESSAGING_AUTOMATION_RULE_REPOSITORY, type MessagingAutomationRule, type MessagingAutomationRuleRepository } from '../domain/messaging-automation-rule.repository';
import { MESSAGING_MESSAGE_TEMPLATE_REPOSITORY, type MessagingMessageTemplate, type MessagingMessageTemplateRepository } from '../domain/messaging-message-template.repository';
import { MessagingTemplateRenderer, MessagingTemplateValidationError } from './messaging-template-renderer';
import { DEFAULT_MESSAGING_TEMPLATES } from './messaging-template.defaults';

export class MessagingConfigurationBusinessNotFoundError extends Error {}
export class MessagingConfigurationTemplateNotFoundError extends Error {}
export class MessagingConfigurationInputError extends Error {}

@Injectable()
export class MessagingConfigurationUseCases {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(MESSAGING_SETTINGS_REPOSITORY) private readonly settings: MessagingSettingsRepository,
    @Inject(MESSAGING_AUTOMATION_RULE_REPOSITORY) private readonly rules: MessagingAutomationRuleRepository,
    @Inject(MESSAGING_MESSAGE_TEMPLATE_REPOSITORY) private readonly templates: MessagingMessageTemplateRepository,
    private readonly renderer: MessagingTemplateRenderer,
  ) {}

  async getSettings(businessId: string): Promise<{ businessId: string; botEnabled: boolean }> {
    await this.business(businessId);
    const settings = await this.settings.findByBusinessId(businessId);
    return { businessId, botEnabled: settings?.botEnabled ?? true };
  }

  async updateSettings(input: { businessId: string; botEnabled: boolean }): Promise<MessagingSettings> {
    await this.business(input.businessId);
    return this.settings.save(input);
  }

  async listAutomations(businessId: string): Promise<Array<MessagingAutomationRule | { id: null; businessId: string; automationType: MessagingAutomationType; enabled: boolean; templateId: string | null; createdAt: null; updatedAt: null }>> {
    await this.business(businessId);
    const existing = await this.rules.findByBusinessId(businessId);
    return Object.values(MessagingAutomationType).map((automationType) => existing.find((rule) => rule.automationType === automationType) ?? {
      id: null, businessId, automationType, enabled: true, templateId: null, createdAt: null, updatedAt: null,
    });
  }

  async updateAutomation(input: { businessId: string; automationType: MessagingAutomationType; enabled: boolean; templateId?: string | null }): Promise<MessagingAutomationRule> {
    await this.business(input.businessId);
    const current = await this.rules.findByBusinessAndType(input.businessId, input.automationType);
    const templateId = input.templateId === undefined ? current?.templateId ?? null : input.templateId;
    if (templateId) {
      const template = await this.templates.findByIdAndBusinessId(templateId, input.businessId);
      if (!template || template.businessId !== input.businessId || template.templateType !== input.automationType || template.channel !== MessagingChannel.WHATSAPP) throw new MessagingConfigurationTemplateNotFoundError('La plantilla no existe para este Business, automatización y canal.');
    }
    return this.rules.save({ businessId: input.businessId, automationType: input.automationType, enabled: input.enabled, templateId });
  }

  async listTemplates(businessId: string): Promise<MessagingMessageTemplate[]> {
    await this.business(businessId);
    return this.templates.findByBusinessId(businessId);
  }

  async updateTemplate(input: { businessId: string; templateType: MessagingAutomationType; content: string }): Promise<MessagingMessageTemplate> {
    await this.business(input.businessId);
    try { this.renderer.validate(input.templateType, input.content); }
    catch (error: unknown) { if (error instanceof MessagingTemplateValidationError) throw new MessagingConfigurationInputError(error.message); throw error; }
    return this.templates.save({ businessId: input.businessId, templateType: input.templateType, channel: MessagingChannel.WHATSAPP, content: input.content });
  }

  defaults(): Readonly<Record<MessagingAutomationType, string>> { return DEFAULT_MESSAGING_TEMPLATES; }

  private async business(businessId: string): Promise<void> {
    if (!await this.businesses.findById(businessId)) throw new MessagingConfigurationBusinessNotFoundError('El negocio no existe.');
  }
}
