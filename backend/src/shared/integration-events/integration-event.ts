import { randomUUID } from 'node:crypto';

export const INTEGRATION_EVENT_PAYLOAD_VERSION = 1;

export const IntegrationEventType = {
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  MESSAGING_INBOUND_RECEIVED: 'MESSAGING_INBOUND_RECEIVED',
} as const;

export type IntegrationEventType =
  (typeof IntegrationEventType)[keyof typeof IntegrationEventType];

export type IntegrationEventJsonValue =
  | string
  | number
  | boolean
  | null
  | IntegrationEventJsonValue[]
  | { [key: string]: IntegrationEventJsonValue };

export type IntegrationEventPayload = {
  [key: string]: IntegrationEventJsonValue;
};

export interface IntegrationEvent<TPayload extends IntegrationEventPayload = IntegrationEventPayload> {
  eventId: string;
  eventType: string;
  payloadVersion: number;
  businessId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: TPayload;
}

export function createIntegrationEvent<TPayload extends IntegrationEventPayload>(
  input: Omit<IntegrationEvent<TPayload>, 'eventId' | 'occurredAt' | 'correlationId' | 'payloadVersion'> & {
    correlationId?: string;
  },
): IntegrationEvent<TPayload> {
  const eventId = randomUUID();

  return {
    ...input,
    eventId,
    payloadVersion: INTEGRATION_EVENT_PAYLOAD_VERSION,
    occurredAt: new Date(),
    correlationId: input.correlationId ?? eventId,
  };
}
