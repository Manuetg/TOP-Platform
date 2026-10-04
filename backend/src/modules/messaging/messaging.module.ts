import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationEventsModule } from '../../shared/integration-events/integration-events.module';
import { BookingLifecycleModule } from '../booking-lifecycle/booking-lifecycle.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { AvailabilityModule } from '../availability/availability.module';
import { PricingModule } from '../pricing/pricing.module';
import { ResourceModule } from '../resource/resource.module';
import { OUTBOUND_MESSAGE_REPOSITORY, TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY } from './domain/outbound-message.repository';
import { MessagingIntegrationEventConsumer } from './application/messaging-integration-event.consumer';
import { PrismaOutboundMessageRepository } from './infrastructure/prisma-outbound-message.repository';
import { MESSAGING_PROVIDER } from './application/messaging-provider';
import { SendOutboundMessageUseCase } from './application/send-outbound-message.use-case';
import { FetchMetaWhatsAppHttpClient } from './infrastructure/meta-whatsapp-http-client';
import { MetaWhatsAppProvider } from './infrastructure/meta-whatsapp.provider';
import { readMetaWhatsAppConfiguration } from '../../config/environment';
import { CONVERSATION_REPOSITORY } from './domain/conversation.repository';
import { INBOUND_MESSAGE_REPOSITORY } from './domain/inbound-message.repository';
import { PrismaConversationRepository } from './infrastructure/prisma-conversation.repository';
import { PrismaInboundMessageRepository } from './infrastructure/prisma-inbound-message.repository';
import { PrismaReceiveInboundMessageTransaction } from './infrastructure/prisma-receive-inbound-message.transaction';
import { RECEIVE_INBOUND_MESSAGE_TRANSACTION } from './application/receive-inbound-message.contract';
import { ReceiveInboundMessageUseCase } from './application/receive-inbound-message.use-case';
import { ChangeConversationModeUseCase } from './application/change-conversation-mode.use-case';
import { ConversationBotConsumer } from './application/conversation-bot.consumer';
import { CONVERSATION_BOT_TRANSACTION } from './application/conversation-bot.contract';
import { PrismaConversationBotTransaction } from './infrastructure/prisma-conversation-bot.transaction';

@Module({
  imports: [IntegrationEventsModule, BookingLifecycleModule, BusinessModule, ContactModule, AvailabilityModule, PricingModule, ResourceModule],
  providers: [
    PrismaOutboundMessageRepository,
    { provide: OUTBOUND_MESSAGE_REPOSITORY, useExisting: PrismaOutboundMessageRepository },
    { provide: TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY, useExisting: PrismaOutboundMessageRepository },
    PrismaConversationRepository,
    { provide: CONVERSATION_REPOSITORY, useExisting: PrismaConversationRepository },
    PrismaInboundMessageRepository,
    { provide: INBOUND_MESSAGE_REPOSITORY, useExisting: PrismaInboundMessageRepository },
    PrismaReceiveInboundMessageTransaction,
    { provide: RECEIVE_INBOUND_MESSAGE_TRANSACTION, useExisting: PrismaReceiveInboundMessageTransaction },
    MessagingIntegrationEventConsumer,
    ReceiveInboundMessageUseCase,
    ChangeConversationModeUseCase,
    PrismaConversationBotTransaction,
    { provide: CONVERSATION_BOT_TRANSACTION, useExisting: PrismaConversationBotTransaction },
    ConversationBotConsumer,
  ],
  exports: [OUTBOUND_MESSAGE_REPOSITORY, CONVERSATION_REPOSITORY, INBOUND_MESSAGE_REPOSITORY, ReceiveInboundMessageUseCase, ChangeConversationModeUseCase, MessagingIntegrationEventConsumer, ConversationBotConsumer],
})
export class MessagingModule {
  static registerMetaWhatsApp(): DynamicModule {
    return {
      module: MessagingModule,
      imports: [ConfigModule],
      providers: [
        FetchMetaWhatsAppHttpClient,
        {
          provide: MetaWhatsAppProvider,
          inject: [ConfigService, FetchMetaWhatsAppHttpClient],
          useFactory: (config: ConfigService, http: FetchMetaWhatsAppHttpClient) => new MetaWhatsAppProvider(readMetaWhatsAppConfiguration(config), http),
        },
        { provide: MESSAGING_PROVIDER, useExisting: MetaWhatsAppProvider },
        SendOutboundMessageUseCase,
      ],
      exports: [MESSAGING_PROVIDER, SendOutboundMessageUseCase],
    };
  }
}
