import { FinanceInputError } from './finance.errors';
import { financeReportCsv } from './finance-csv';
import type { FinanceReport } from './finance.types';

function report(): FinanceReport {
  return {
    businessId: 'business-a', currency: 'PYG', timeZone: 'America/Asuncion', basis: 'REGISTERED_OPERATIONS',
    from: '2026-09-01', to: '2026-10-02', asOf: '2026-10-01T12:00:00.000Z', token: 'cut"version', sourceLimit: 5000,
    catalogs: [
      { id: 'category-a', kind: 'CATEGORY', name: 'Mantenimiento', archived: false, version: 1 },
      { id: 'counterparty-a', kind: 'COUNTERPARTY', name: 'Proveedor', archived: true, version: 2 },
    ],
    resources: [{ id: 'resource-a', name: 'Cabaña', active: false }],
    accounts: [{
      id: 'account-a', name: 'Caja', kind: 'CASH', archived: false, version: 1, balanceMinor: 700000, negative: false,
      opening: { id: 'opening-a', amountMinor: 1000000, occurredAt: '2026-10-01T00:00:00.000Z', reason: 'Saldo documentado' },
    }, {
      id: 'account-b', name: 'Banco', kind: 'BANK', archived: true, version: 2, balanceMinor: null, negative: false, opening: null,
    }],
    expenses: [{
      id: 'expense-a', description: 'Reparación, "motor"\nconsumida en septiembre', consumedOn: '2026-09-30', dueOn: '2026-09-30',
      counterpartyId: 'counterparty-a', counterpartyName: 'Proveedor', reference: null, evidenceMissing: true,
      amountMinor: 900000, paidAmountMinor: 300000, outstandingMinor: 600000, overdue: true, version: 2,
      lines: [{
        id: 'line-a', label: 'Reparación', categoryId: 'category-a', categoryName: 'Mantenimiento',
        resourceId: 'resource-a', resourceName: 'Cabaña', amountMinor: 850000, operational: true,
      }, {
        id: 'line-b', label: 'Parte no operativa', categoryId: 'category-a', categoryName: 'Mantenimiento',
        resourceId: null, resourceName: null, amountMinor: 50000, operational: false,
      }],
      settlements: [{
        id: 'settlement-a', accountId: 'account-a', amountMinor: 300000,
        occurredAt: '2026-10-01T10:00:00.000Z', reference: 'Recibo 1', recordedByUserId: 'owner-a',
      }], recordedByUserId: 'owner-a', createdAt: '2026-10-01T09:00:00.000Z',
    }],
    payments: [{
      id: 'payment-a', bookingId: 'booking-a', amountMinor: 400000, currency: 'PYG', paidAt: '2026-09-20T12:00:00.000Z',
      reference: 'Pago original', accountId: null, version: 0, includedInBalance: false,
      paymentVersion: 1, effectiveStatus: 'RETAINED', grossRecordedAmountMinor: 400000,
      voidedAmountMinor: 0, refundedAmountMinor: 0, netRetainedAmountMinor: 400000,
    }],
    movements: [{
      id: 'movement-a', sourceType: 'SETTLEMENT', sourceId: 'settlement-a', sourceVersion: 1, accountId: 'account-a',
      amountMinor: -300000, occurredAt: '2026-10-01T10:00:00.000Z', description: 'Pago de gasto',
      includedInBalance: true, reviewed: true, reviewVersion: 1, reviewStale: false,
      reviewDetails: { actorUserId: 'reviewer-a', occurredAt: '2026-10-01T10:30:00.000Z', reason: 'Evidencia cotejada' },
    }, {
      id: 'movement-b', sourceType: 'PAYMENT', sourceId: 'payment-a', sourceVersion: 2, accountId: 'account-a',
      amountMinor: 400000, occurredAt: '2026-09-20T12:00:00.000Z', description: 'Cobro anterior al corte de apertura',
      includedInBalance: false, reviewed: false, reviewVersion: 1, reviewStale: true,
      reviewDetails: { actorUserId: 'reviewer-old', occurredAt: '2026-09-20T13:00:00.000Z', reason: 'Revisión de versión anterior' },
    }],
    balanceSources: [{
      id: 'opening-a', sourceType: 'OPENING', sourceId: 'opening-a', sourceVersion: 1, accountId: 'account-a',
      amountMinor: 1000000, occurredAt: '2026-10-01T00:00:00.000Z', description: 'Saldo documentado',
      includedInBalance: true, reviewed: false, reviewVersion: 0, reviewStale: false, reviewDetails: null,
    }, {
      id: 'movement-a', sourceType: 'SETTLEMENT', sourceId: 'settlement-a', sourceVersion: 1, accountId: 'account-a',
      amountMinor: -300000, occurredAt: '2026-10-01T10:00:00.000Z', description: 'Pago de gasto',
      includedInBalance: true, reviewed: true, reviewVersion: 1, reviewStale: false,
      reviewDetails: { actorUserId: 'reviewer-a', occurredAt: '2026-10-01T10:30:00.000Z', reason: 'Evidencia cotejada' },
    }],
    cashCounts: [{
      id: 'count-a', accountId: 'account-a', occurredAt: '2026-10-01T11:00:00.000Z',
      expectedAmountMinor: 700000, countedAmountMinor: 695000, differenceMinor: -5000,
      reason: 'Arqueo de turno', version: 1, adjustmentId: null, recordedByUserId: 'owner-a',
    }],
    totals: {
      expenseMinor: 900000, operatingCostMinor: 850000, paymentsMinor: 400000, settlementsMinor: 300000,
      outstandingMinor: 600000, overdueMinor: 600000, unassignedPaymentsMinor: 400000, registeredBalanceMinor: 700000,
      grossRecordedAmountMinor: 400000, voidedAmountMinor: 0, refundedAmountMinor: 0,
      netRecordedReceiptFlowMinor: 400000, paymentNetRetainedAmountMinor: 400000,
    },
    coverage: { unconfiguredAccountIds: ['account-b'], missingEvidenceExpenseIds: ['expense-a'], unknownHistoricalDebt: true, serviceRevenueAvailable: false },
  };
}

function csvRows(csv: string): Record<string, string>[] {
  const cells = Array.from(csv.matchAll(/"((?:[^"]|"")*)"(?:,|\r\n)/g), match => match[1].replace(/""/g, '"'));
  const header = Array.from(csv.slice(0, csv.indexOf('\r\n')).matchAll(/"([^"]+)"/g), match => match[1]);
  return Array.from({ length: (cells.length - header.length) / header.length }, (_, index) =>
    Object.fromEntries(header.map((name, column) => [name, cells[(index + 1) * header.length + column]])));
}

describe('Finance operational CSV', () => {
  it('exports the given collection/cut, linked source IDs, totals and declared coverage', () => {
    const source = report();
    const before = JSON.stringify(source);
    const rows = csvRows(financeReportCsv(source));
    expect(rows).toHaveLength(35);
    expect(rows.filter(row => row.recordType === 'EXPENSE').map(row => row.id)).toEqual(source.expenses.map(item => item.id));
    expect(rows.find(row => row.id === 'expense-a')).toMatchObject({
      amountMinor: '900000', outstandingMinor: '600000', consumedOn: '2026-09-30', dueOn: '2026-09-30',
      description: source.expenses[0].description, counterpartyId: 'counterparty-a', evidenceMissing: 'true', actorUserId: 'owner-a',
    });
    expect(rows.filter(row => row.recordType === 'EXPENSE_LINE').map(row => row.parentId)).toEqual(['expense-a', 'expense-a']);
    expect(rows.find(row => row.recordType === 'PAYMENT')).toMatchObject({ id: 'payment-a', parentId: 'booking-a', amountMinor: '400000', includedInBalance: 'false' });
    expect(rows.find(row => row.recordType === 'PAYMENT')).toMatchObject({ paymentVersion: '1', status: 'RETAINED', grossRecordedAmountMinor: '400000', voidedAmountMinor: '0', refundedAmountMinor: '0', netRetainedAmountMinor: '400000' });
    expect(rows.find(row => row.id === 'movement-a')).toMatchObject({ sourceType: 'SETTLEMENT', sourceId: 'settlement-a', amountMinor: '-300000', reviewed: 'true' });
    expect(rows.find(row => row.id === 'movement-b')).toMatchObject({ includedInBalance: 'false', reviewStale: 'true' });
    expect(rows.find(row => row.recordType === 'CASH_COUNT')).toMatchObject({ expectedAmountMinor: '700000', countedAmountMinor: '695000', differenceMinor: '-5000' });
    expect(rows.find(row => row.id === 'account-b')).toMatchObject({ balanceMinor: '', status: 'ARCHIVED' });
    expect(rows.find(row => row.sourceType === 'UNCONFIGURED_ACCOUNTS')).toMatchObject({ description: 'account-b' });
    for (const [name, value] of Object.entries(source.totals)) {
      expect(rows.find(row => row.recordType === 'TOTAL' && row.sourceType === name)?.amountMinor).toBe(String(value));
    }
    for (const row of rows) expect(row).toMatchObject({
      businessId: source.businessId, currency: 'PYG', timeZone: source.timeZone, basis: source.basis,
      from: source.from, to: source.to, asOf: source.asOf, token: source.token, sourceLimit: '5000',
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(['=SUM(A1)', '+cmd', '-formula', '@formula', '\tformula', '\rformula', '\nformula', '  =formula', '\uFEFF=hidden'])(
    'neutralizes textual formula injection %j', name => {
      const source = report();
      source.catalogs = [{ ...source.catalogs[0], name }];
      expect(csvRows(financeReportCsv(source)).find(row => row.recordType === 'CATALOG')?.description).toBe(`'${name}`);
    },
  );

  it.each(['=SUM(A1)', '-recibo, "privado"\ncontinuación'])(
    'exports exactly one complete settlement row with escaped private reference %j', reference => {
      const source = report();
      const expense = source.expenses[0];
      const settlement = expense.settlements[0];
      settlement.reference = reference;
      const rows = csvRows(financeReportCsv(source));
      const settlements = rows.filter(row => row.recordType === 'SETTLEMENT');
      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toMatchObject({
        id: settlement.id, sourceType: 'SETTLEMENT', sourceId: settlement.id, parentId: expense.id,
        accountId: settlement.accountId, amountMinor: '300000', occurredAt: settlement.occurredAt,
        reference: `'${reference}`, actorUserId: settlement.recordedByUserId,
      });
      const cashRows = rows.filter(row => ['MOVEMENT', 'BALANCE_SOURCE'].includes(row.recordType) && row.sourceId === settlement.id);
      expect(cashRows.map(row => row.recordType)).toEqual(['MOVEMENT', 'BALANCE_SOURCE']);
      expect(cashRows.map(row => row.amountMinor)).toEqual(['-300000', '-300000']);
    },
  );

  it('escapes commas, quotes/newlines and leaves numeric negative amounts usable', () => {
    const source = report();
    source.movements[0].description = '-text, "quoted"\nnext';
    const csv = financeReportCsv(source);
    expect(csv).toContain('"\'-text, ""quoted""\nnext"');
    expect(csvRows(csv).find(row => row.id === 'movement-a')).toMatchObject({ description: '\'-text, "quoted"\nnext', amountMinor: '-300000' });
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('preserves unknown registered balance and empty sources without inventing an opening', () => {
    const source = report();
    source.accounts = [];
    source.expenses = [];
    source.payments = [];
    source.movements = [];
    source.balanceSources = [];
    source.cashCounts = [];
    source.totals.registeredBalanceMinor = null;
    const rows = csvRows(financeReportCsv(source));
    expect(rows.filter(row => row.recordType === 'OPENING')).toEqual([]);
    expect(rows.find(row => row.sourceType === 'registeredBalanceMinor')?.amountMinor).toBe('');
  });

  it('distinguishes current obligations and operational resources in the exported collection', () => {
    const source = report();
    source.expenses[0].overdue = false;
    source.resources[0].active = true;
    const rows = csvRows(financeReportCsv(source));
    expect(rows.find(row => row.id === 'expense-a')?.status).toBe('CURRENT');
    expect(rows.find(row => row.recordType === 'RESOURCE')?.status).toBe('ACTIVE');
  });

  it('reconstructs a balance from opening and signed sources preceding the selected period without doubling other groups', () => {
    const source = report();
    const account = source.accounts[0];
    if (!account.opening) throw new Error('The fixture requires a documented opening.');
    source.from = '2026-10-01';
    account.opening.occurredAt = '2026-09-01T00:00:00.000Z';
    source.balanceSources[0].occurredAt = account.opening.occurredAt;
    source.balanceSources.splice(1, 0, {
      ...source.balanceSources[1], id: 'prior-contribution', sourceType: 'MOVEMENT', sourceId: 'prior-contribution',
      sourceVersion: 7, amountMinor: 400000, occurredAt: '2026-09-15T12:00:00.000Z',
      description: 'Aporte anterior al período', reviewed: false, reviewVersion: 0, reviewDetails: null,
    });
    account.balanceMinor = 1100000;
    source.totals.registeredBalanceMinor = 1100000;
    source.movements = source.movements.filter(movement => movement.occurredAt >= '2026-10-01');
    source.payments = [];
    const rows = csvRows(financeReportCsv(source));
    const sources = rows.filter(row => row.recordType === 'BALANCE_SOURCE');
    expect(sources.map(row => row.sourceId)).toEqual(['opening-a', 'prior-contribution', 'settlement-a']);
    expect(sources.find(row => row.sourceId === 'prior-contribution')).toMatchObject({
      accountId: 'account-a', sourceType: 'MOVEMENT', version: '7', amountMinor: '400000',
      occurredAt: '2026-09-15T12:00:00.000Z', from: '2026-10-01', includedInBalance: 'true',
    });
    const reconstructed = sources.filter(row => row.includedInBalance === 'true')
      .reduce((total, row) => total + BigInt(row.amountMinor), 0n);
    expect(reconstructed).toBe(BigInt(account.balanceMinor));
    expect(reconstructed.toString()).toBe(rows.find(row => row.recordType === 'TOTAL' && row.sourceType === 'registeredBalanceMinor')?.amountMinor);
    expect(rows.filter(row => row.recordType === 'OPENING')).toHaveLength(1);
    expect(rows.filter(row => row.recordType === 'MOVEMENT').map(row => row.sourceId)).toEqual(['settlement-a']);
    expect(rows.find(row => row.recordType === 'DICTIONARY')?.description).toContain('sumar exclusivamente BALANCE_SOURCE');
  });

  it('exports review actor/date/reason while distinguishing current, stale and absent reviews', () => {
    const source = report();
    delete source.balanceSources[0].reviewDetails;
    const rows = csvRows(financeReportCsv(source));
    for (const recordType of ['MOVEMENT', 'BALANCE_SOURCE']) {
      expect(rows.find(row => row.recordType === recordType && row.sourceId === 'settlement-a')).toMatchObject({
        reviewed: 'true', reviewStale: 'false', reviewVersion: '1', reviewActor: 'reviewer-a',
        reviewedAt: '2026-10-01T10:30:00.000Z', reason: 'Evidencia cotejada',
      });
    }
    expect(rows.find(row => row.recordType === 'MOVEMENT' && row.sourceId === 'payment-a')).toMatchObject({
      reviewed: 'false', reviewStale: 'true', reviewActor: 'reviewer-old',
      reviewedAt: '2026-09-20T13:00:00.000Z', reason: 'Revisión de versión anterior',
    });
    expect(rows.find(row => row.recordType === 'BALANCE_SOURCE' && row.sourceId === 'opening-a')).toMatchObject({
      reviewed: 'false', reviewStale: 'false', reviewVersion: '0', reviewActor: '', reviewedAt: '', reason: '',
    });
  });

  it('neutralizes formula injection in review evidence without changing signed balance amounts', () => {
    const source = report();
    source.balanceSources[1].reviewDetails = { actorUserId: 'reviewer-a', occurredAt: '2026-10-01T10:30:00.000Z', reason: '=SUM(A1)' };
    expect(csvRows(financeReportCsv(source)).find(row => row.recordType === 'BALANCE_SOURCE' && row.sourceId === 'settlement-a'))
      .toMatchObject({ reason: "'=SUM(A1)", amountMinor: '-300000' });
  });

  it('rejects unsafe numeric output instead of silently rounding', () => {
    const source = report();
    source.totals.expenseMinor = Number.MAX_SAFE_INTEGER + 1;
    expect(() => financeReportCsv(source)).toThrow(FinanceInputError);
  });
});
