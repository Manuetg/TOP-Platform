import { MessagingAutomationType } from './messaging-automation-type.enum';

export interface MessagingAutomationRule {
  id: string;
  businessId: string;
  automationType: MessagingAutomationType;
  enabled: boolean;
  templateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MESSAGING_AUTOMATION_RULE_REPOSITORY = Symbol('MESSAGING_AUTOMATION_RULE_REPOSITORY');

export interface MessagingAutomationRuleRepository {
  findByBusinessId(businessId: string): Promise<MessagingAutomationRule[]>;
  findByBusinessAndType(businessId: string, automationType: MessagingAutomationType): Promise<MessagingAutomationRule | null>;
  save(input: { businessId: string; automationType: MessagingAutomationType; enabled: boolean; templateId: string | null }): Promise<MessagingAutomationRule>;
}
