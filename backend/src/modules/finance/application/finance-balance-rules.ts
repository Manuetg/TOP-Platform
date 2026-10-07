import { safeMoney } from '../domain/finance-money';

export interface BalanceEvent { accountId: string; instant: number; amount: bigint }

export function guardBalanceEvents(events: BalanceEvent[]): void {
  const accountEvents = new Map<string, Map<number, bigint>>();
  const consolidatedEvents = new Map<number, bigint>();
  for (const event of events) {
    const timeline = accountEvents.get(event.accountId) ?? new Map<number, bigint>();
    timeline.set(event.instant, (timeline.get(event.instant) ?? 0n) + event.amount);
    accountEvents.set(event.accountId, timeline);
    consolidatedEvents.set(event.instant, (consolidatedEvents.get(event.instant) ?? 0n) + event.amount);
  }
  for (const timeline of accountEvents.values()) guardTimeline(timeline);
  guardTimeline(consolidatedEvents);
}

function guardTimeline(timeline: Map<number, bigint>): void {
  let total = 0n;
  for (const instant of [...timeline.keys()].sort((a, b) => a - b)) {
    total += timeline.get(instant)!;
    safeMoney(total);
  }
}
