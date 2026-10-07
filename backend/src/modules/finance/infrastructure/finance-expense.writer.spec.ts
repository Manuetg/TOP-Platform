import { FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceCommand, FinanceMutation } from '../domain/finance.types';
import type { FinanceTransaction } from './finance-prisma-context';
import { writeFinanceExpense } from './finance-expense.writer';

const businessId = '00000000-0000-4000-8000-000000000001';
const resourceId = '00000000-0000-4000-8000-000000000002';
const command: Extract<FinanceCommand, { type: 'CREATE_EXPENSE' }> = {
  type: 'CREATE_EXPENSE', description: 'Reparación histórica', consumedOn: '2026-09-30', dueOn: null,
  counterpartyId: null, reference: null, amountMinor: 900000, settlement: null,
  lines: [{ label: 'Reparación', categoryId: '00000000-0000-4000-8000-000000000003', resourceId, amountMinor: 900000, operational: true }],
};
const input: FinanceMutation = { businessId, actorUserId: '00000000-0000-4000-8000-000000000004', command, idempotencyKey: 'finance-intent-0001', fingerprint: 'fingerprint' };

function transaction(resourceBusinessId: string, resourceStatus: string): { tx: FinanceTransaction; writes: string[] } {
  const writes: string[] = [];
  const tx = {
    financeCatalog: { count: (): Promise<number> => Promise.resolve(1) },
    resource: { count: (args: { where: { businessId: string; id: { in: string[] }; status?: string } }): Promise<number> => {
      const matchesTenant = args.where.businessId === resourceBusinessId;
      const matchesId = args.where.id.in.includes(resourceId);
      const matchesStatus = args.where.status === undefined || args.where.status === resourceStatus;
      return Promise.resolve(matchesTenant && matchesId && matchesStatus ? 1 : 0);
    } },
    financeExpense: { create: (): Promise<{ id: string; version: number }> => { writes.push('document'); return Promise.resolve({ id: 'expense', version: 1 }); } },
    financeExpenseLine: { createMany: (): Promise<{ count: number }> => { writes.push('lines'); return Promise.resolve({ count: 1 }); } },
  } as unknown as FinanceTransaction;
  return { tx, writes };
}

describe('Expense resource attribution preserves historical resources', () => {
  it.each(['OUT_OF_SERVICE', 'ARCHIVED'])('admits explicit same-tenant historical cost for %s without reactivating the Resource', async (status) => {
    const { tx, writes } = transaction(businessId, status);
    await expect(writeFinanceExpense(tx, input, command)).resolves.toEqual({ id: 'expense', version: 1, type: 'CREATE_EXPENSE' });
    expect(writes).toEqual(['document', 'lines']);
  });

  it('rejects a Resource from another Business before document writes', async () => {
    const { tx, writes } = transaction('00000000-0000-4000-8000-000000000005', 'ARCHIVED');
    await expect(writeFinanceExpense(tx, input, command)).rejects.toBeInstanceOf(FinanceNotFoundError);
    expect(writes).toEqual([]);
  });
});
