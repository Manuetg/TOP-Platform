import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { IntegrationEventType, type IntegrationEvent } from '../../../shared/integration-events/integration-event';
import type { IntegrationEventConsumer } from '../../../shared/integration-events/integration-event.consumer';
import { IntegrationEventConsumerRegistry } from '../../../shared/integration-events/integration-event-consumer-registry';
import { CONVERSATION_BOT_TRANSACTION, type ConversationBotTransaction } from './conversation-bot.contract';
import { MESSAGING_SETTINGS_REPOSITORY, type MessagingSettingsRepository } from '../domain/messaging-settings.repository';

@Injectable()
export class ConversationBotConsumer implements IntegrationEventConsumer, OnModuleInit {
  readonly eventTypes = [IntegrationEventType.MESSAGING_INBOUND_RECEIVED] as const;

  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(CONVERSATION_BOT_TRANSACTION) private readonly transaction: ConversationBotTransaction,
    private readonly registry: IntegrationEventConsumerRegistry,
    @Optional() @Inject(MESSAGING_SETTINGS_REPOSITORY) private readonly settings?: MessagingSettingsRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return this.eventTypes.includes(eventType as (typeof this.eventTypes)[number]);
  }

  async handle(event: IntegrationEvent): Promise<void> {
    if (!this.supports(event.eventType)) return;
    const business = await this.businesses.findById(event.businessId);
    if (!business) throw new Error('El negocio del evento entrante no existe.');
    const settings = await this.settings?.findByBusinessId(event.businessId);
    if (settings && !settings.botEnabled) return;
    await this.transaction.process({ event, businessName: business.name, businessTimeZone: business.timezone });
  }
}
