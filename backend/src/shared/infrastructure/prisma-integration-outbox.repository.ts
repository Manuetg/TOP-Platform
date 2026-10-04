import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../modules/business/infrastructure/prisma.service';
import type { IntegrationEvent } from '../integration-events/integration-event';
import type { IntegrationOutboxEventRecord, IntegrationOutboxRepository } from '../integration-events/integration-outbox.repository';

type ClaimedOutboxRow = {
  eventId: string;
  eventType: string;
  payloadVersion: number;
  businessId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
};

@Injectable()
export class PrismaIntegrationOutboxRepository implements IntegrationOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recoverAbandoned(input: { now: Date; processingTimeoutMs: number }): Promise<number> {
    const cutoff = new Date(input.now.getTime() - input.processingTimeoutMs);
    const result = await this.prisma.integrationOutboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: { lt: cutoff },
      },
      data: {
        status: 'PENDING',
        availableAt: input.now,
        processingStartedAt: null,
        processingToken: null,
        lastError: 'PROCESSING_TIMEOUT',
      },
    });
    return result.count;
  }

  async claimNext(input: {
    now: Date;
    claimToken: string;
    supportedEventTypes: readonly string[];
  }): Promise<IntegrationOutboxEventRecord | null> {
    if (input.supportedEventTypes.length === 0) return null;

    const eventTypes = Prisma.join(input.supportedEventTypes);
    const rows = await this.prisma.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "eventId"
        FROM "IntegrationOutboxEvent"
        WHERE "status" = CAST('PENDING' AS "IntegrationOutboxStatus")
          AND "availableAt" <= ${input.now}
          AND "eventType" IN (${eventTypes})
        ORDER BY "availableAt" ASC, "createdAt" ASC, "eventId" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "IntegrationOutboxEvent" AS event
      SET "status" = CAST('PROCESSING' AS "IntegrationOutboxStatus"),
          "attemptCount" = event."attemptCount" + 1,
          "processingStartedAt" = ${input.now},
          "processingToken" = ${input.claimToken},
          "lastError" = NULL
      FROM candidate
      WHERE event."eventId" = candidate."eventId"
      RETURNING event."eventId", event."eventType", event."payloadVersion", event."businessId",
        event."aggregateType", event."aggregateId", event."occurredAt", event."correlationId",
        event."payload", event."attemptCount"
    `);

    const row = rows[0];
    return row ? this.map(row) : null;
  }

  async markProcessed(input: { eventId: string; claimToken: string; processedAt: Date }): Promise<boolean> {
    const result = await this.prisma.integrationOutboxEvent.updateMany({
      where: { eventId: input.eventId, status: 'PROCESSING', processingToken: input.claimToken },
      data: {
        status: 'PROCESSED',
        processedAt: input.processedAt,
        processingStartedAt: null,
        processingToken: null,
      },
    });
    return result.count === 1;
  }

  async markForRetry(input: { eventId: string; claimToken: string; availableAt: Date; lastError: string }): Promise<boolean> {
    const result = await this.prisma.integrationOutboxEvent.updateMany({
      where: { eventId: input.eventId, status: 'PROCESSING', processingToken: input.claimToken },
      data: {
        status: 'PENDING',
        availableAt: input.availableAt,
        processingStartedAt: null,
        processingToken: null,
        lastError: input.lastError,
      },
    });
    return result.count === 1;
  }

  async markFailed(input: { eventId: string; claimToken: string; failedAt: Date; lastError: string }): Promise<boolean> {
    const result = await this.prisma.integrationOutboxEvent.updateMany({
      where: { eventId: input.eventId, status: 'PROCESSING', processingToken: input.claimToken },
      data: {
        status: 'FAILED',
        processedAt: null,
        availableAt: input.failedAt,
        processingStartedAt: null,
        processingToken: null,
        lastError: input.lastError,
      },
    });
    return result.count === 1;
  }

  private map(row: ClaimedOutboxRow): IntegrationOutboxEventRecord {
    return {
      eventId: row.eventId,
      eventType: row.eventType,
      payloadVersion: row.payloadVersion,
      businessId: row.businessId,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      occurredAt: row.occurredAt,
      correlationId: row.correlationId,
      payload: row.payload as IntegrationEvent['payload'],
      attemptCount: row.attemptCount,
    };
  }
}
