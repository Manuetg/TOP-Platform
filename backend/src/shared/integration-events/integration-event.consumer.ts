import type { IntegrationEvent } from './integration-event';

export interface IntegrationEventConsumer {
  // Consumers must deduplicate side effects with eventId because recovery is at-least-once.
  readonly eventTypes: readonly string[];
  supports(eventType: string): boolean;
  handle(event: IntegrationEvent): Promise<void>;
}

export const INTEGRATION_EVENT_CONSUMERS = Symbol('INTEGRATION_EVENT_CONSUMERS');
