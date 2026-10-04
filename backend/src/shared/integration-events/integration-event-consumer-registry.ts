import { Injectable } from '@nestjs/common';
import type { IntegrationEventConsumer } from './integration-event.consumer';

@Injectable()
export class IntegrationEventConsumerRegistry {
  private readonly registered: IntegrationEventConsumer[] = [];

  register(consumer: IntegrationEventConsumer): void {
    if (!this.registered.includes(consumer)) this.registered.push(consumer);
  }

  all(): readonly IntegrationEventConsumer[] {
    return this.registered;
  }
}
