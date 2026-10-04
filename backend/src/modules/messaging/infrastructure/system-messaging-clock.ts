import type { MessagingClock } from '../application/messaging-clock';

export class SystemMessagingClock implements MessagingClock {
  now(): Date {
    return new Date();
  }
}
