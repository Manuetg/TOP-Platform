export interface MessagingSettings {
  businessId: string;
  botEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const MESSAGING_SETTINGS_REPOSITORY = Symbol('MESSAGING_SETTINGS_REPOSITORY');

export interface MessagingSettingsRepository {
  findByBusinessId(businessId: string): Promise<MessagingSettings | null>;
  save(input: { businessId: string; botEnabled: boolean }): Promise<MessagingSettings>;
}
