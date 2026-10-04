import { Injectable } from '@nestjs/common';
import { type PrismaClient } from '@prisma/client';
import type { IntegrationEvent } from '../integration-events/integration-event';
import type {
  IntegrationEventOutbox,
} from '../integration-events/integration-event.outbox';

type TransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

@Injectable()
export class PrismaIntegrationEventOutbox implements IntegrationEventOutbox {
  async append(
    transaction: unknown,
    event: IntegrationEvent,
  ): Promise<void> {
    const client = transaction as TransactionClient;
    await client.integrationOutboxEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        payloadVersion: event.payloadVersion,
        businessId: event.businessId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt,
        availableAt: event.occurredAt,
        correlationId: event.correlationId,
        payload: event.payload,
      },
    });
  }
}
