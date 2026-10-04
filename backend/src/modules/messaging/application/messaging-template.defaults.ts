import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';

export const DEFAULT_MESSAGING_TEMPLATES: Readonly<Record<MessagingAutomationType, string>> = {
  [MessagingAutomationType.BOOKING_CONFIRMED]: [
    'Tu reserva en {{businessName}} fue confirmada.',
    '',
    '{{resourceName}}',
    '{{checkIn}} → {{checkOut}}',
    '{{guests}}',
    '',
    'Total confirmado: {{total}} {{currency}}.',
  ].join('\n'),
  [MessagingAutomationType.BOOKING_CANCELLED]: [
    'Tu reserva en {{businessName}} fue cancelada.',
    '',
    '{{resourceName}}',
    '{{checkIn}} → {{checkOut}}',
  ].join('\n'),
};

