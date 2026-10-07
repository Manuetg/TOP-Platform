import * as reportReader from './finance-v2-cost.report-reader';
import { FinanceV2OperationalReadService } from './finance-v2-operational.read-service';
import { FinanceV2BudgetSqlStore } from './finance-v2-budget.sql-store';
import { FinanceV2PrismaSqlHost, type FinancePrismaRawTransaction, type FinancePrismaTransactionClient } from './finance-v2-prisma-sql.adapter';
import type { FinanceBudgetDto, FinanceCommitmentDto, FinanceCostReport } from '../domain/finance-v2.types';

const id = '10000000-0000-4000-8000-000000000001';
const cut = '2026-10-05T12:00:00.000Z';
const basis = 'ACTUAL_PLUS_PENDING_COMMITMENTS';

describe('presupuesto con previsión comparte transacción readonly y corte servidor', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  it('GWT obtiene costos, presupuesto y pending una vez dentro del mismo RR; devuelve 1.2M sin escrituras', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date(cut));
    const query = jest.fn((sql: string, ...values: unknown[]): unknown => {
      expect(values[0]).toBe(id);
      if (sql.includes('UserBusinessMembership')) return [{ status: 'ACTIVE', role: 'OWNER', timeZone: 'America/Asuncion', currency: 'PYG' }];
      if (sql.includes('FROM "FinanceCommitment"')) return [{ id: 'commitment' }];
      throw new Error('Consulta inesperada en prueba de transacción');
    });
    const execute = jest.fn(); const native: FinancePrismaRawTransaction = { $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise.resolve(query(sql, ...values) as T), $executeRawUnsafe: execute };
    const transactions: unknown[] = [];
    const prisma: FinancePrismaTransactionClient = { $transaction: <T>(work: (tx: FinancePrismaRawTransaction) => Promise<T>, options: { isolationLevel: 'ReadCommitted' | 'RepeatableRead'; timeout: number }) => { transactions.push(options); return work(native); } };
    const budgetReader = jest.spyOn(FinanceV2BudgetSqlStore.prototype, 'budgetByMonth').mockResolvedValue(budget());
    const pendingReader = jest.spyOn(FinanceV2BudgetSqlStore.prototype, 'commitment').mockResolvedValue(commitment());
    const costs = jest.spyOn(reportReader, 'readFinanceV2CostReport').mockResolvedValue(costReport());
    const service = new FinanceV2OperationalReadService(new FinanceV2PrismaSqlHost(prisma), { read: jest.fn() });

    const result = await service.budgetComparison({ businessId: id, actorUserId: id }, '2026-09', basis);

    expect(transactions).toEqual([{ isolationLevel: 'RepeatableRead', timeout: 30000 }]);
    expect(budgetReader).toHaveBeenCalledTimes(1); expect(budgetReader).toHaveBeenCalledWith(id, '2026-09');
    expect(pendingReader).toHaveBeenCalledTimes(1); expect(pendingReader).toHaveBeenCalledWith(id, 'commitment');
    expect(costs).toHaveBeenCalledTimes(1);
    expect(costs.mock.calls[0][1]).toEqual({ businessId: id, timeZone: 'America/Asuncion', from: '2026-09-01', to: '2026-10-01', asOf: cut });
    expect(result).toMatchObject({ asOf: cut, forecastBasis: basis });
    expect(result.lines.find(row => row.resourceId === 'r')).toMatchObject({ forecastMinor: 1200000, forecastDeviationMinor: 200000 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('state=\'ACTIVE\''), id, '2026-09-01', '2026-10-01');
    expect(execute).not.toHaveBeenCalled();
  });
});

function budget(): FinanceBudgetDto {
  return { id: 'budget', businessId: id, periodMonth: '2026-09', kind: 'OPERATING_COST', version: 2, approvedRevisionId: 'revision', revisions: [{ id: 'revision', revisionNo: 1, lines: [{ id: 'line', ordinal: 0, categoryId: 'cat', resourceId: 'r', approvedMinor: 1000000 }], recordedByUserId: id, reason: 'Meta aprobada', createdAt: cut, approvedByUserId: id, approvedAt: cut }] };
}
function commitment(): FinanceCommitmentDto {
  return { id: 'commitment', businessId: id, description: 'Compra', amountMinor: 400000, categoryId: 'cat', resourceId: 'r', expectedConsumptionOn: '2026-09-20', dueOn: null, operational: true, reference: null, reason: 'Plan', version: 1, state: 'ACTIVE', consumedMinor: 0, pendingMinor: 400000, recordedByUserId: id, createdAt: cut, conversions: [] };
}
function costReport(): FinanceCostReport {
  return { businessId: id, currency: 'PYG', timeZone: 'America/Asuncion', from: '2026-09-01', to: '2026-10-01', asOf: cut, token: 'cost-token', sourceLimit: 5000, basis: 'SOURCE_COSTS', rows: [{ source: { kind: 'EXPENSE_LINE', id: 'source', version: 1, hash: 'hash' }, expenseId: 'expense', expenseLineId: 'source', bookingId: null, resourceId: 'r', categoryId: 'cat', consumedOn: '2026-09-15', basis: 'ACTUAL', kind: 'DIRECT', amountMinor: 800000, ruleId: null, ruleVersion: null, allocationVersion: 0, destinations: [{ resourceId: 'r', amountMinor: 800000 }], unassignedMinor: 0 }], totals: { actualCostMinor: 800000, estimatedSelectedMinor: 0, ownerImputedMinor: 0, unknownSourceCount: 0 }, coverage: { missingEvidenceSourceIds: [], unknownSourceIds: [], unsupportedReasons: [] } };
}
