import type { FinanceCashCount } from '@prisma/client';
import { FinanceConflictError } from '../domain/finance.errors';
import type { FinanceCommand, FinanceMutation } from '../domain/finance.types';
import type { FinanceTransaction } from './finance-prisma-context';
import { writeFinanceCashCount } from './finance-cash-count.writer';

describe('Cash count adjustment cut uniqueness', () => {
  it('rejects a second count adjustment on the same account/cut before any balance write', async () => {
    const command: Extract<FinanceCommand, { type: 'ADJUST_COUNT' }> = { type: 'ADJUST_COUNT', id: 'count-two', expectedVersion: 1, reason: 'Falta efectivo' };
    const input: FinanceMutation = { businessId: 'business-a', actorUserId: 'owner', command, idempotencyKey: 'finance-intent-0001', fingerprint: 'fingerprint' };
    const count: FinanceCashCount = { id: command.id, businessId: input.businessId, accountId: 'cash', occurredAt: new Date('2026-10-05T12:00:00Z'), expectedAmountMinor: 1000000n, countedAmountMinor: 995000n, differenceMinor: -5000n, reason: 'Falta efectivo', version: 1, adjustmentId: null, recordedByUserId: input.actorUserId, createdAt: new Date('2026-10-05T12:00:00Z') };
    const read = jest.fn<Promise<FinanceCashCount | { id: string } | null>, [unknown]>().mockResolvedValueOnce(count).mockResolvedValueOnce({ id: 'count-one' });
    const writes: string[] = [];
    const tx = {
      financeCashCount: { findFirst: read, update: (): void => { writes.push('count'); } },
      financeCashMovement: { create: (): void => { writes.push('movement'); } },
    } as unknown as FinanceTransaction;
    await expect(writeFinanceCashCount(tx, input, command)).rejects.toThrow(new FinanceConflictError('Este corte ya tiene un ajuste; registra nuevo arqueo con corte posterior.'));
    expect(writes).toEqual([]);
    expect(read.mock.calls[1]).toEqual([{ where: { businessId: input.businessId, accountId: count.accountId, occurredAt: count.occurredAt, id: { not: count.id }, adjustmentId: { not: null } }, select: { id: true } }]);
  });
});
