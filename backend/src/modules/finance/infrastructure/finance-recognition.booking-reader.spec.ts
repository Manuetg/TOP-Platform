import { Prisma } from '@prisma/client';
import { listFinanceServiceEvidence, readFinanceServiceEvidence, readFinanceServiceEvidenceBatch } from '../../booking/booking.contract';

describe('Contrato público Booking de evidencia de servicio; transacción simulada sin DB', () => {
  function fixture() {
    const calls: Prisma.Sql[] = [];
    const booking = { id: 'booking', businessId: 'tenant', updatedAt: new Date('2026-10-05T12:00:00.000Z'), checkInDate: new Date('2026-09-01T00:00:00.000Z'), checkOutDate: new Date('2026-09-04T00:00:00.000Z'), status: 'COMPLETED' };
    const events: { id: string; bookingId: string; type: string; actorUserId: string | null; details: Prisma.JsonValue }[] = [
      { id: 'automatic-check-in', bookingId: 'booking', type: 'BOOKING_CHECKED_IN', actorUserId: 'actor', details: { source: 'CALENDAR', operation: 'CHECK_IN' } },
      { id: 'without-actor', bookingId: 'booking', type: 'BOOKING_CHECKED_IN', actorUserId: null, details: { source: 'MANUAL', operation: 'CHECK_IN' } },
      { id: 'real-check-in', bookingId: 'booking', type: 'BOOKING_CHECKED_IN', actorUserId: 'actor', details: { source: 'MANUAL', operation: 'CHECK_IN' } },
      { id: 'wrong-operation', bookingId: 'booking', type: 'BOOKING_CHECKED_OUT', actorUserId: 'actor', details: { source: 'MANUAL', operation: 'CHECK_IN' } },
      { id: 'real-check-out', bookingId: 'booking', type: 'BOOKING_CHECKED_OUT', actorUserId: 'actor', details: { source: 'MANUAL', operation: 'CHECK_OUT' } },
    ];
    const tx = { $queryRaw: jest.fn((query: Prisma.Sql) => Promise.resolve().then(() => {
      calls.push(query);
      if (query.sql.includes('FROM "BookingTimelineEvent"')) return events;
      if (query.sql.includes('FROM "BookingResource"')) return [{ bookingId: 'booking', resourceId: 'resource' }];
      if (query.sql.startsWith('SELECT id FROM "Booking"')) return [{ id: 'booking' }];
      return [booking];
    })) } as unknown as Prisma.TransactionClient;
    return { calls, tx, booking, events };
  }
  it('selecciona sólo eventos manuales con actor y operación coherente; fechas son contexto acordado', async () => {
    const test = fixture(); const result = await readFinanceServiceEvidence(test.tx, 'tenant', 'booking');
    expect(result).toMatchObject({ bookingId: 'booking', checkInDate: '2026-09-01', checkOutDate: '2026-09-04', checkInEventId: 'real-check-in', checkOutEventId: 'real-check-out' });
    expect(test.calls).toHaveLength(3);
    expect(test.calls.every(query => query.values.includes('tenant'))).toBe(true);
    expect(test.calls.some(query => query.sql.includes('FOR UPDATE'))).toBe(false);
  });
  it('COMPLETED sin actas manuales sigue sin evidencia; no deriva prestación del reloj', async () => {
    const test = fixture(); test.events.splice(0, test.events.length);
    expect(await readFinanceServiceEvidence(test.tx, 'tenant', 'booking')).toMatchObject({ status: 'COMPLETED', checkInEventId: null, checkOutEventId: null });
  });
  it('lista candidatos con corte de creación y rango, mediante un único batch', async () => {
    const test = fixture(); await listFinanceServiceEvidence(test.tx, { businessId: 'tenant', from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T12:00:00.000Z', limit: 5000 });
    expect(test.calls).toHaveLength(4); expect(test.calls[0].values).toEqual(expect.arrayContaining(['tenant', '2026-09-01', '2026-10-01', new Date('2026-10-05T12:00:00.000Z')]));
  });
  it('límite total, IDs duplicados o límite inválido falla cerrado sin resultados parciales', async () => {
    const test = fixture(); await expect(readFinanceServiceEvidenceBatch(test.tx, 'tenant', ['booking'], 5)).rejects.toMatchObject({ code: 'SOURCE_LIMIT' });
    const empty = fixture(); await expect(readFinanceServiceEvidenceBatch(empty.tx, 'tenant', ['booking', 'booking'])).rejects.toMatchObject({ code: 'SOURCE_LIMIT' }); expect(empty.calls).toHaveLength(0);
    await expect(readFinanceServiceEvidenceBatch(empty.tx, 'tenant', [], 5001)).rejects.toMatchObject({ code: 'SOURCE_LIMIT' }); expect(empty.calls).toHaveLength(0);
  });
  it('batch vacío evita lecturas y ausencia de Booking no fabrica contexto', async () => {
    const test = fixture(); expect((await readFinanceServiceEvidenceBatch(test.tx, 'tenant', [])).size).toBe(0); expect(test.calls).toHaveLength(0);
    jest.mocked(test.tx.$queryRaw).mockResolvedValue([]); await expect(readFinanceServiceEvidence(test.tx, 'tenant', 'missing')).resolves.toBeNull();
  });
});
