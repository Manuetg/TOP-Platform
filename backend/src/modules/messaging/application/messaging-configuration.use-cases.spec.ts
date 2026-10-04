import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';
import type { MessagingAutomationRuleRepository } from '../domain/messaging-automation-rule.repository';
import type { MessagingMessageTemplateRepository } from '../domain/messaging-message-template.repository';
import type { MessagingSettingsRepository } from '../domain/messaging-settings.repository';
import { MessagingConfigurationUseCases } from './messaging-configuration.use-cases';
import { MessagingTemplateRenderer } from './messaging-template-renderer';

describe('MessagingConfigurationUseCases', () => {
  const findBusiness = jest.fn();
  const business = { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() };
  const findSettings = jest.fn();
  const settings: MessagingSettingsRepository = { findByBusinessId: findSettings, save: jest.fn() };
  const findRule = jest.fn();
  const saveRule = jest.fn();
  const rules: MessagingAutomationRuleRepository = { findByBusinessId: jest.fn(), findByBusinessAndType: findRule, save: saveRule };
  const findTemplate = jest.fn();
  const saveTemplate = jest.fn();
  const templates: MessagingMessageTemplateRepository = { findByBusinessId: jest.fn(), findByIdAndBusinessId: findTemplate, findByBusinessTypeAndChannel: jest.fn(), save: saveTemplate };
  const useCases = new MessagingConfigurationUseCases(business, settings, rules, templates, new MessagingTemplateRenderer());

  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ id: 'business' }); });

  it('returns bot enabled when no settings row exists', async () => {
    findSettings.mockResolvedValue(null);
    await expect(useCases.getSettings('business')).resolves.toEqual({ businessId: 'business', botEnabled: true });
  });

  it('rejects unknown template variables before persistence', async () => {
    await expect(useCases.updateTemplate({ businessId: 'business', templateType: MessagingAutomationType.BOOKING_CONFIRMED, content: '{{unknown}}' })).rejects.toThrow('no está permitida');
    expect(saveTemplate).not.toHaveBeenCalled();
  });

  it('validates the template tenant before assigning it to a rule', async () => {
    findTemplate.mockResolvedValue({ id: 'template', businessId: 'other', templateType: MessagingAutomationType.BOOKING_CONFIRMED, channel: MessagingChannel.WHATSAPP });
    await expect(useCases.updateAutomation({ businessId: 'business', automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: true, templateId: 'template' })).rejects.toThrow('no existe');
    expect(saveRule).not.toHaveBeenCalled();
  });

  it('preserves an existing template when only the enabled flag changes', async () => {
    findRule.mockResolvedValue({ templateId: 'template', businessId: 'business', automationType: MessagingAutomationType.BOOKING_CONFIRMED, id: 'rule', enabled: true, createdAt: new Date(), updatedAt: new Date() });
    findTemplate.mockResolvedValue({ id: 'template', businessId: 'business', templateType: MessagingAutomationType.BOOKING_CONFIRMED, channel: MessagingChannel.WHATSAPP });
    saveRule.mockResolvedValue({});

    await useCases.updateAutomation({ businessId: 'business', automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: false });

    expect(saveRule).toHaveBeenCalledWith({ businessId: 'business', automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: false, templateId: 'template' });
  });
});
