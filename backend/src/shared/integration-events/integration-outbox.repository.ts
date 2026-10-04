import type { IntegrationEvent } from './integration-event';

export interface IntegrationOutboxEventRecord extends IntegrationEvent {
  attemptCount: number;
}

export interface IntegrationOutboxRepository {
  recoverAbandoned(input: { now: Date; processingTimeoutMs: number }): Promise<number>;
  claimNext(input: {
    now: Date;
    claimToken: string;
    supportedEventTypes: readonly string[];
  }): Promise<IntegrationOutboxEventRecord | null>;
  markProcessed(input: { eventId: string; claimToken: string; processedAt: Date }): Promise<boolean>;
  markForRetry(input: {
    eventId: string;
    claimToken: string;
    availableAt: Date;
    lastError: string;
  }): Promise<boolean>;
  markFailed(input: {
    eventId: string;
    claimToken: string;
    failedAt: Date;
    lastError: string;
  }): Promise<boolean>;
}

export const INTEGRATION_OUTBOX_REPOSITORY = Symbol('INTEGRATION_OUTBOX_REPOSITORY');
