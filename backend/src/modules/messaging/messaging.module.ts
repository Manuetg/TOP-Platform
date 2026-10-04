import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationEventsModule } from '../../shared/integration-events/integration-events.module';
import { BookingLifecycleModule } from '../booking-lifecycle/booking-lifecycle.module';
import { BookingModule } from '../booking/booking.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { AvailabilityModule } from '../availability/availability.module';
import { PricingModule } from '../pricing/pricing.module';
import { ResourceModule } from '../resource/resource.module';
import { OUTBOUND_MESSAGE_REPOSITORY, TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY } from './domain/outbound-message.repository';
import { MessagingIntegrationEventConsumer } from './application/messaging-integration-event.consumer';
import { PrismaOutboundMessageRepository } from './infrastructure/prisma-outbound-message.repository';
import { MESSAGING_PROVIDER } from './application/messaging-provider';
import { MESSAGING_PROVIDER_CREDENTIAL_RESOLVER } from './application/messaging-provider-credentials';
import { MESSAGING_SECRET_STORE } from './application/messaging-secret-store';
import { SendOutboundMessageUseCase } from './application/send-outbound-message.use-case';
import { FetchMetaWhatsAppHttpClient } from './infrastructure/meta-whatsapp-http-client';
import { MetaWhatsAppProvider } from './infrastructure/meta-whatsapp.provider';
import { EnvironmentMessagingSecretStore } from './infrastructure/environment-messaging-secret.store';
import { PrismaMessagingProviderCredentialRepository } from './infrastructure/prisma-messaging-provider-credential.repository';
import { PrismaMessagingProviderCredentialResolver } from './infrastructure/prisma-messaging-provider-credential.resolver';
import { MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY } from './domain/messaging-provider-credential.repository';
import { readMetaWhatsAppConfiguration, readMetaWhatsAppEmbeddedSignupConfiguration, readMetaWhatsAppWebhookConfiguration, readNodeEnvironment } from '../../config/environment';
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
import { PrismaMessagingSettingsRepository } from './infrastructure/prisma-messaging-settings.repository';
import { MESSAGING_SETTINGS_REPOSITORY } from './domain/messaging-settings.repository';
import { PrismaMessagingAutomationRuleRepository } from './infrastructure/prisma-messaging-automation-rule.repository';
import { MESSAGING_AUTOMATION_RULE_REPOSITORY } from './domain/messaging-automation-rule.repository';
import { PrismaMessagingMessageTemplateRepository } from './infrastructure/prisma-messaging-message-template.repository';
import { MESSAGING_MESSAGE_TEMPLATE_REPOSITORY } from './domain/messaging-message-template.repository';
import { MessagingTemplateRenderer } from './application/messaging-template-renderer';
import { MESSAGING_AUTOMATION_CONFIGURATION, MessagingAutomationConfigurationService } from './application/messaging-automation-configuration';
import { MessagingConfigurationUseCases } from './application/messaging-configuration.use-cases';
import { MessagingConfigurationController } from './presentation/messaging-configuration.controller';
import { MessagingInboxController } from './presentation/messaging-inbox.controller';
import { CONVERSATION_INBOX_READER } from './domain/conversation-inbox.repository';
import { PrismaConversationInboxReader } from './infrastructure/prisma-conversation-inbox.reader';
import { MessagingInboxUseCases, SendManualConversationMessageUseCase } from './application/messaging-inbox.use-cases';
import { MESSAGING_CONNECTION_RESOLVER, MESSAGING_OUTBOUND_CONNECTION_RESOLVER } from './domain/messaging-connection.repository';
import { PrismaMessagingConnectionResolver } from './infrastructure/prisma-messaging-connection.resolver';
import { META_WHATSAPP_WEBHOOK_CONFIGURATION, MetaWhatsAppWebhookSecurity } from './infrastructure/meta-whatsapp-webhook.signature';
import { MetaWhatsAppWebhookParser } from './infrastructure/meta-whatsapp-webhook.parser';
import { ProcessMessagingWebhookUseCase } from './application/process-messaging-webhook.use-case';
import { MetaWhatsAppWebhookController } from './presentation/meta-whatsapp-webhook.controller';
import { MetaWhatsAppEmbeddedSignupController } from './presentation/meta-whatsapp-embedded-signup.controller';
import { PrismaMessagingConnectionOnboardingAttemptRepository } from './infrastructure/prisma-messaging-connection-onboarding-attempt.repository';
import { MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY } from './domain/messaging-connection-onboarding-attempt.repository';
import { SystemMessagingClock } from './infrastructure/system-messaging-clock';
import { MESSAGING_CLOCK } from './application/messaging-clock';
import { PrismaMessagingConnectionOnboardingTransaction } from './infrastructure/prisma-messaging-connection-onboarding.transaction';
import { MESSAGING_CONNECTION_ONBOARDING_TRANSACTION, META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION } from './application/messaging-embedded-signup.contract';
import { FetchMetaWhatsAppEmbeddedSignupClient } from './infrastructure/meta-whatsapp-embedded-signup.client';
import { META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT } from './application/meta-whatsapp-embedded-signup.client';
import { StartMetaWhatsAppEmbeddedSignupUseCase } from './application/start-meta-whatsapp-embedded-signup.use-case';
import { CompleteMetaWhatsAppEmbeddedSignupUseCase } from './application/complete-meta-whatsapp-embedded-signup.use-case';

@Module({
  imports: [ConfigModule, IntegrationEventsModule, BookingLifecycleModule, BookingModule, BusinessModule, ContactModule, AvailabilityModule, PricingModule, ResourceModule],
  controllers: [MessagingConfigurationController, MessagingInboxController, MetaWhatsAppWebhookController, MetaWhatsAppEmbeddedSignupController],
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
    PrismaMessagingSettingsRepository,
    { provide: MESSAGING_SETTINGS_REPOSITORY, useExisting: PrismaMessagingSettingsRepository },
    PrismaMessagingAutomationRuleRepository,
    { provide: MESSAGING_AUTOMATION_RULE_REPOSITORY, useExisting: PrismaMessagingAutomationRuleRepository },
    PrismaMessagingMessageTemplateRepository,
    { provide: MESSAGING_MESSAGE_TEMPLATE_REPOSITORY, useExisting: PrismaMessagingMessageTemplateRepository },
    MessagingTemplateRenderer,
    MessagingAutomationConfigurationService,
    { provide: MESSAGING_AUTOMATION_CONFIGURATION, useExisting: MessagingAutomationConfigurationService },
    MessagingConfigurationUseCases,
    PrismaConversationInboxReader,
    { provide: CONVERSATION_INBOX_READER, useExisting: PrismaConversationInboxReader },
    MessagingInboxUseCases,
    SendManualConversationMessageUseCase,
    PrismaMessagingConnectionResolver,
    { provide: MESSAGING_CONNECTION_RESOLVER, useExisting: PrismaMessagingConnectionResolver },
    { provide: MESSAGING_OUTBOUND_CONNECTION_RESOLVER, useExisting: PrismaMessagingConnectionResolver },
    PrismaMessagingProviderCredentialRepository,
    { provide: MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY, useExisting: PrismaMessagingProviderCredentialRepository },
    {
      provide: EnvironmentMessagingSecretStore,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new EnvironmentMessagingSecretStore({ accessToken: typeof config.get('META_WHATSAPP_ACCESS_TOKEN') === 'string' ? config.get('META_WHATSAPP_ACCESS_TOKEN') : undefined, graphApiVersion: 'v26.0' }, readNodeEnvironment(config)),
    },
    { provide: MESSAGING_SECRET_STORE, useExisting: EnvironmentMessagingSecretStore },
    PrismaMessagingProviderCredentialResolver,
    { provide: MESSAGING_PROVIDER_CREDENTIAL_RESOLVER, useExisting: PrismaMessagingProviderCredentialResolver },
    FetchMetaWhatsAppHttpClient,
    {
      provide: META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configuration = readMetaWhatsAppEmbeddedSignupConfiguration(config);
        return { environment: configuration.environment, graphApiVersion: configuration.graphApiVersion, appId: configuration.appId, appSecret: configuration.appSecret, configurationId: configuration.configurationId, attemptTtlSeconds: configuration.attemptTtlSeconds, processingTimeoutSeconds: configuration.processingTimeoutSeconds };
      },
    },
    {
      provide: FetchMetaWhatsAppEmbeddedSignupClient,
      inject: [META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION, FetchMetaWhatsAppHttpClient],
      useFactory: (configuration: ConstructorParameters<typeof FetchMetaWhatsAppEmbeddedSignupClient>[0], http: FetchMetaWhatsAppHttpClient) => new FetchMetaWhatsAppEmbeddedSignupClient(configuration, http),
    },
    { provide: META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT, useExisting: FetchMetaWhatsAppEmbeddedSignupClient },
    SystemMessagingClock,
    { provide: MESSAGING_CLOCK, useExisting: SystemMessagingClock },
    PrismaMessagingConnectionOnboardingAttemptRepository,
    { provide: MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY, useExisting: PrismaMessagingConnectionOnboardingAttemptRepository },
    PrismaMessagingConnectionOnboardingTransaction,
    { provide: MESSAGING_CONNECTION_ONBOARDING_TRANSACTION, useExisting: PrismaMessagingConnectionOnboardingTransaction },
    StartMetaWhatsAppEmbeddedSignupUseCase,
    CompleteMetaWhatsAppEmbeddedSignupUseCase,
    {
      provide: META_WHATSAPP_WEBHOOK_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => readMetaWhatsAppWebhookConfiguration(config),
    },
    {
      provide: MetaWhatsAppWebhookSecurity,
      inject: [META_WHATSAPP_WEBHOOK_CONFIGURATION],
      useFactory: (configuration: ReturnType<typeof readMetaWhatsAppWebhookConfiguration>) => new MetaWhatsAppWebhookSecurity(configuration),
    },
    MetaWhatsAppWebhookParser,
    ProcessMessagingWebhookUseCase,
  ],
  exports: [OUTBOUND_MESSAGE_REPOSITORY, CONVERSATION_REPOSITORY, INBOUND_MESSAGE_REPOSITORY, CONVERSATION_INBOX_READER, MESSAGING_SETTINGS_REPOSITORY, MESSAGING_AUTOMATION_RULE_REPOSITORY, MESSAGING_MESSAGE_TEMPLATE_REPOSITORY, MESSAGING_AUTOMATION_CONFIGURATION, MESSAGING_CONNECTION_RESOLVER, ReceiveInboundMessageUseCase, ChangeConversationModeUseCase, MessagingIntegrationEventConsumer, ConversationBotConsumer, MessagingInboxUseCases, SendManualConversationMessageUseCase],
})
export class MessagingModule {
  static registerMetaWhatsApp(): DynamicModule {
    return {
      module: MessagingModule,
      imports: [ConfigModule],
      providers: [
        FetchMetaWhatsAppHttpClient,
        {
          provide: EnvironmentMessagingSecretStore,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => new EnvironmentMessagingSecretStore(readMetaWhatsAppConfiguration(config), readNodeEnvironment(config)),
        },
        { provide: MESSAGING_SECRET_STORE, useExisting: EnvironmentMessagingSecretStore },
        PrismaMessagingProviderCredentialResolver,
        {
          provide: MESSAGING_PROVIDER_CREDENTIAL_RESOLVER,
          useExisting: PrismaMessagingProviderCredentialResolver,
        },
        {
          provide: MetaWhatsAppProvider,
          inject: [ConfigService, FetchMetaWhatsAppHttpClient, MESSAGING_PROVIDER_CREDENTIAL_RESOLVER],
          useFactory: (config: ConfigService, http: FetchMetaWhatsAppHttpClient, credentials: PrismaMessagingProviderCredentialResolver) => new MetaWhatsAppProvider(readMetaWhatsAppConfiguration(config), http, credentials),
        },
        { provide: MESSAGING_PROVIDER, useExisting: MetaWhatsAppProvider },
        SendOutboundMessageUseCase,
      ],
      exports: [MESSAGING_PROVIDER, SendOutboundMessageUseCase],
    };
  }
}
