import type { IntegrationEvent } from '../../../src/shared/integration-events/integration-event';
import type { IntegrationEventConsumer } from '../../../src/shared/integration-events/integration-event.consumer';

export class FakeIntegrationEventConsumer implements IntegrationEventConsumer {
  readonly eventTypes = ['BOOKING_CONFIRMED'] as const;
  readonly received: IntegrationEvent[] = [];
  fail = false;
  delayMs = 0;
  onHandle?: (event: IntegrationEvent) => Promise<void>;

  supports(eventType: string): boolean {
    return this.eventTypes.includes(eventType as (typeof this.eventTypes)[number]);
  }

  async handle(event: IntegrationEvent): Promise<void> {
    if (this.onHandle) await this.onHandle(event);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.fail) throw new Error('forced consumer failure');
    if (!this.received.some((received) => received.eventId === event.eventId)) this.received.push(event);
  }
}
