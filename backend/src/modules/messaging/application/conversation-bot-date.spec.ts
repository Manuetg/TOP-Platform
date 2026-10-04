import { currentBusinessDate, parseConversationDate } from './conversation-bot-date';

describe('conversation bot dates', () => {
  it('validates calendar dates and normalizes DD/MM/YYYY and ISO', () => {
    expect(parseConversationDate('15/10/2026')).toBe('2026-10-15');
    expect(parseConversationDate('2026-10-15')).toBe('2026-10-15');
    expect(parseConversationDate('31/02/2026')).toBeNull();
  });

  it('derives today using the Business timezone instead of the machine timezone', () => {
    const now = new Date('2026-10-03T02:00:00.000Z');

    expect(currentBusinessDate('America/Asuncion', now)).toBe('2026-10-02');
    expect(currentBusinessDate('Pacific/Kiritimati', now)).toBe('2026-10-03');
  });
});
