export interface MessagingClock {
  now(): Date;
}

export const MESSAGING_CLOCK = Symbol('MESSAGING_CLOCK');
