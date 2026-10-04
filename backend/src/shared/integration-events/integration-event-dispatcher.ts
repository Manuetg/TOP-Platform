import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { IntegrationEventConsumer } from './integration-event.consumer';
import type { IntegrationEventConsumerRegistry } from './integration-event-consumer-registry';
import type { IntegrationOutboxRepository } from './integration-outbox.repository';

export type IntegrationEventDispatchOutcome = 'IDLE' | 'PROCESSED' | 'RETRY_SCHEDULED' | 'FAILED';

export interface IntegrationEventDispatcherOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  processingTimeoutMs?: number;
  now?: () => Date;
  workerId?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60 * 60 * 1_000;
const DEFAULT_PROCESSING_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_ERROR_LENGTH = 2_000;

@Injectable()
export class IntegrationEventDispatcher {
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly processingTimeoutMs: number;
  private readonly now: () => Date;
  private readonly workerId: string;

  constructor(
    private readonly outbox: IntegrationOutboxRepository,
    private readonly consumerSource: readonly IntegrationEventConsumer[] | IntegrationEventConsumerRegistry = [],
    options: IntegrationEventDispatcherOptions = {},
  ) {
    this.maxAttempts = this.positiveInteger(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 'maxAttempts');
    this.baseBackoffMs = this.nonNegativeInteger(options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS, 'baseBackoffMs');
    this.maxBackoffMs = this.nonNegativeInteger(options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS, 'maxBackoffMs');
    this.processingTimeoutMs = this.positiveInteger(options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS, 'processingTimeoutMs');
    this.now = options.now ?? (() => new Date());
    this.workerId = options.workerId ?? randomUUID();
  }

  async dispatchOnce(): Promise<IntegrationEventDispatchOutcome> {
    const now = this.now();
    await this.outbox.recoverAbandoned({ now, processingTimeoutMs: this.processingTimeoutMs });

    const consumers = this.consumers();
    const supportedEventTypes = [...new Set(
      consumers.flatMap((consumer) => this.supportedEventTypes(consumer)),
    )];
    if (supportedEventTypes.length === 0) return 'IDLE';

    const claimToken = `${this.workerId}:${randomUUID()}`;
    const event = await this.outbox.claimNext({ now, claimToken, supportedEventTypes });
    if (!event) return 'IDLE';

    const matchingConsumers = consumers.filter((consumer) => consumer.supports(event.eventType));
    try {
      for (const consumer of matchingConsumers) await consumer.handle(event);
      const marked = await this.outbox.markProcessed({ eventId: event.eventId, claimToken, processedAt: this.now() });
      return marked ? 'PROCESSED' : 'IDLE';
    } catch (error) {
      const lastError = normalizeIntegrationError(error);
      const failedAt = this.now();
      if (event.attemptCount >= this.maxAttempts) {
        await this.outbox.markFailed({ eventId: event.eventId, claimToken, failedAt, lastError });
        return 'FAILED';
      }

      const delay = Math.min(this.maxBackoffMs, this.baseBackoffMs * (2 ** Math.max(0, event.attemptCount - 1)));
      await this.outbox.markForRetry({
        eventId: event.eventId,
        claimToken,
        availableAt: new Date(failedAt.getTime() + delay),
        lastError,
      });
      return 'RETRY_SCHEDULED';
    }
  }

  async dispatchAvailable(limit = 10): Promise<number> {
    const boundedLimit = this.positiveInteger(limit, 'limit');
    let processed = 0;
    for (let index = 0; index < boundedLimit; index += 1) {
      const outcome = await this.dispatchOnce();
      if (outcome === 'IDLE') break;
      processed += 1;
    }
    return processed;
  }

  private supportedEventTypes(consumer: IntegrationEventConsumer): string[] {
    return [...new Set(consumer.eventTypes.filter((eventType) => consumer.supports(eventType)))];
  }

  private consumers(): readonly IntegrationEventConsumer[] {
    return 'all' in this.consumerSource ? this.consumerSource.all() : this.consumerSource;
  }

  private positiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
    return value;
  }

  private nonNegativeInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
    return value;
  }
}

export function normalizeIntegrationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Unknown integration consumer error').slice(0, MAX_ERROR_LENGTH);
}
