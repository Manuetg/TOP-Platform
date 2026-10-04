import type { IntegrationEvent } from './integration-event';

export const INTEGRATION_EVENT_OUTBOX = Symbol('INTEGRATION_EVENT_OUTBOX');

export interface IntegrationEventOutbox {
  append(
    transaction: unknown,
    event: IntegrationEvent,
  ): Promise<void>;
}
