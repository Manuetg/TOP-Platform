import { Global, Module } from '@nestjs/common';
import { BusinessModule } from '../../modules/business/business.module';
import { INTEGRATION_EVENT_OUTBOX } from './integration-event.outbox';
import { PrismaIntegrationEventOutbox } from '../infrastructure/prisma-integration-event.outbox';
import { INTEGRATION_OUTBOX_REPOSITORY } from './integration-outbox.repository';
import { PrismaIntegrationOutboxRepository } from '../infrastructure/prisma-integration-outbox.repository';
import { INTEGRATION_EVENT_CONSUMERS } from './integration-event.consumer';
import { IntegrationEventDispatcher } from './integration-event-dispatcher';
import { IntegrationEventConsumerRegistry } from './integration-event-consumer-registry';

@Global()
@Module({
  imports: [BusinessModule],
  providers: [
    PrismaIntegrationEventOutbox,
    PrismaIntegrationOutboxRepository,
    IntegrationEventConsumerRegistry,
    {
      provide: INTEGRATION_OUTBOX_REPOSITORY,
      useExisting: PrismaIntegrationOutboxRepository,
    },
    {
      provide: INTEGRATION_EVENT_CONSUMERS,
      useValue: [],
    },
    {
      provide: IntegrationEventDispatcher,
      useFactory: (repository: PrismaIntegrationOutboxRepository, registry: IntegrationEventConsumerRegistry) =>
        new IntegrationEventDispatcher(repository, registry),
      inject: [INTEGRATION_OUTBOX_REPOSITORY, IntegrationEventConsumerRegistry],
    },
    {
      provide: INTEGRATION_EVENT_OUTBOX,
      useExisting: PrismaIntegrationEventOutbox,
    },
  ],
  exports: [INTEGRATION_EVENT_OUTBOX, INTEGRATION_OUTBOX_REPOSITORY, IntegrationEventDispatcher, IntegrationEventConsumerRegistry],
})
export class IntegrationEventsModule {}
