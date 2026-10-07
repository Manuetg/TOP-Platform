import { mapFinanceReport } from './finance-report.mapper';
import type { FinanceSources } from './finance-report.loader';

const actor = { businessId: 'business-a', actorUserId: 'owner' };
const query = { from: '2026-10-01', to: '2026-11-01' };
const instant = (day: number): Date => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);

function sources(): FinanceSources {
  const cash = { id: 'cash', businessId: actor.businessId, name: 'Caja', kind: 'CASH', archived: false, version: 1, createdAt: instant(1), opening: { id: 'cash-opening', businessId: actor.businessId, accountId: 'cash', amountMinor: 0n, occurredAt: new Date('2026-10-01T03:00:00Z'), reason: 'Apertura real', recordedByUserId: 'owner', createdAt: instant(1) } };
  const bank = { ...cash, id: 'bank', name: 'Banco', kind: 'BANK', opening: { ...cash.opening, id: 'bank-opening', accountId: 'bank', amountMinor: 1000000n } };
  const category = { id: 'category', businessId: actor.businessId, kind: 'CATEGORY', name: 'Reparaciones', archived: true, version: 2, createdAt: instant(1) };
  const settlement = { id: 'settlement', businessId: actor.businessId, expenseId: 'expense', accountId: 'bank', amountMinor: 300000n, occurredAt: instant(3), reference: 'Pago real', recordedByUserId: 'owner', createdAt: instant(3) };
  return {
    bounds: { from: new Date('2026-10-01T03:00:00Z'), to: new Date('2026-11-01T03:00:00Z') },
    catalogs: [category], resources: [{ id: 'resource', name: 'Cabaña', status: 'ACTIVE' }], accounts: [cash, bank],
    expenses: [{ id: 'expense', businessId: actor.businessId, description: 'Reparación', consumedOn: new Date('2026-10-02'), dueOn: new Date('2026-10-03'), counterpartyId: null, counterparty: null, reference: null, amountMinor: 900000n, version: 2, recordedByUserId: 'owner', createdAt: instant(2), lines: [
      { id: 'line-1', businessId: actor.businessId, expenseId: 'expense', bookingId: null, bookingSourceUpdatedAt: null, bookingSourceStatus: null, label: 'Trabajo', categoryId: category.id, category, resourceId: 'resource', resource: { id: 'resource', businessId: actor.businessId, name: 'Cabaña', internalCode: 'C1', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: 'ACTIVE', sortOrder: 0, createdAt: instant(1), updatedAt: instant(1) }, amountMinor: 600000n, operational: true },
      { id: 'line-2', businessId: actor.businessId, expenseId: 'expense', bookingId: null, bookingSourceUpdatedAt: null, bookingSourceStatus: null, label: 'Activo', categoryId: category.id, category, resourceId: null, resource: null, amountMinor: 300000n, operational: false },
    ], settlements: [settlement], evidenceFiles: [] }],
    settlements: [settlement],
    links: [{ id: 'link', businessId: actor.businessId, paymentId: 'payment', accountId: 'cash', version: 2, recordedByUserId: 'owner', createdAt: instant(2) }],
    transfers: [{ id: 'transfer', businessId: actor.businessId, fromAccountId: 'bank', toAccountId: 'cash', amountMinor: 300000n, occurredAt: instant(4), reason: 'Efectivo para operación', recordedByUserId: 'owner', createdAt: instant(4) }],
    cashMovements: [{ id: 'withdrawal', businessId: actor.businessId, accountId: 'cash', kind: 'WITHDRAWAL', amountMinor: -200000n, occurredAt: instant(5), reason: 'Retiro propietario', openingId: null, recordedByUserId: 'owner', createdAt: instant(5) }],
    reviews: [{ id: 'review', businessId: actor.businessId, sourceType: 'PAYMENT', sourceId: 'payment', sourceVersion: 1, reviewed: true, version: 1, reason: 'Soporte revisado', recordedByUserId: 'owner', createdAt: instant(2) }],
    reviewOccurredAt: { review: instant(2).toISOString() },
    cashCounts: [{ id: 'count', businessId: actor.businessId, accountId: 'cash', occurredAt: instant(6), expectedAmountMinor: 500000n, countedAmountMinor: 495000n, differenceMinor: -5000n, reason: 'Falta efectivo', version: 1, adjustmentId: null, recordedByUserId: 'owner', createdAt: instant(6) }],
    paymentAdjustments: [],
    payments: [{ paymentVersion: 1, id: 'payment', bookingId: 'booking', amountMinor: 400000, currency: 'PYG', paidAt: instant(2).toISOString(), reference: 'Cobro' }, { paymentVersion: 1, id: 'unassigned', bookingId: 'booking', amountMinor: 100000, currency: 'PYG', paidAt: instant(3).toISOString(), reference: null }],
  };
}

describe('Finance read projection with independent expected amounts', () => {
  it('attached private evidence resolves missing coverage without inventing a reference or changing money', () => {
    const fixture = sources();
    const before = mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10));
    fixture.expenses[0].evidenceFiles = [{ id: 'private-file' }];
    const after = mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10));
    expect(after.expenses[0]).toMatchObject({ reference: null, evidenceMissing: false });
    expect(after.coverage.missingEvidenceExpenseIds).toEqual([]);
    expect(after.totals).toEqual(before.totals);
    expect(after.token).not.toBe(before.token);
  });
  it('separates expense, partial obligation, gross recorded payments, internal transfers and owner withdrawal', () => {
    const report = mapFinanceReport(actor, query, 'America/Asuncion', sources(), instant(10));
    expect(report.totals).toEqual({ expenseMinor: 900000, operatingCostMinor: 600000, paymentsMinor: 500000, settlementsMinor: 300000, outstandingMinor: 600000, overdueMinor: 600000, unassignedPaymentsMinor: 100000, registeredBalanceMinor: 900000, grossRecordedAmountMinor: 500000, voidedAmountMinor: 0, refundedAmountMinor: 0, netRecordedReceiptFlowMinor: 500000, paymentNetRetainedAmountMinor: 500000 });
    expect(report.accounts.map((account) => [account.id, account.balanceMinor])).toEqual([['cash', 500000], ['bank', 400000]]);
    expect(report.expenses[0]).toMatchObject({ evidenceMissing: true, amountMinor: 900000, paidAmountMinor: 300000, outstandingMinor: 600000, counterpartyName: null });
    expect(report.expenses[0].lines).toEqual(expect.arrayContaining([expect.objectContaining({ categoryName: 'Reparaciones', resourceName: 'Cabaña' }), expect.objectContaining({ resourceName: null, operational: false })]));
    expect(report.cashCounts[0]).toMatchObject({ expectedAmountMinor: 500000, countedAmountMinor: 495000, differenceMinor: -5000, adjustmentId: null });
    const transfer = report.movements.filter((movement) => movement.sourceType === 'TRANSFER');
    expect(transfer.map((movement) => movement.amountMinor).reduce((sum, value) => sum + value, 0)).toBe(0);
    const payment = report.balanceSources.find((movement) => movement.sourceType === 'PAYMENT');
    expect(payment).toMatchObject({ sourceId: 'payment', sourceVersion: 2, bookingId: 'booking', reviewStale: true, reviewed: false, reviewVersion: 1, reviewDetails: { actorUserId: 'owner', occurredAt: instant(2).toISOString(), reason: 'Soporte revisado' } });
    expect(report.coverage).toEqual({ unconfiguredAccountIds: [], missingEvidenceExpenseIds: ['expense'], unknownHistoricalDebt: true, serviceRevenueAvailable: false });
  });

  it('exposes pre-period balance sources and excludes already included pre-opening payments', () => {
    const fixture = sources();
    fixture.accounts[0].opening!.occurredAt = new Date('2026-01-01T03:00:00Z');
    fixture.payments[0].paidAt = '2026-02-01T12:00:00Z';
    fixture.payments.push({ paymentVersion: 1, id: 'old', bookingId: 'booking', currency: 'PYG', amountMinor: 900000, paidAt: '2025-12-01T12:00:00Z', reference: null });
    fixture.links.push({ ...fixture.links[0], id: 'old-link', paymentId: 'old', version: 1 });
    const report = mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10));
    expect(report.totals.paymentsMinor).toBe(100000);
    expect(report.accounts[0].balanceMinor).toBe(500000);
    expect(report.balanceSources).toEqual(expect.arrayContaining([expect.objectContaining({ sourceType: 'PAYMENT', sourceId: 'payment', amountMinor: 400000, occurredAt: '2026-02-01T12:00:00Z' })]));
    expect(report.balanceSources.some((row) => row.sourceId === 'old')).toBe(false);
    expect(report.movements.some((row) => row.sourceType === 'OPENING' && row.accountId === 'cash')).toBe(false);
  });

  it('returns unknown balances for accounts without or after-cut openings, and supports negative configured balances', () => {
    const fixture = sources();
    fixture.accounts[0].opening = null;
    fixture.accounts[1].opening!.occurredAt = new Date('2026-12-01T00:00:00Z');
    const report = mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10));
    expect(report.accounts.map((row) => row.balanceMinor)).toEqual([null, null]);
    expect(report.totals.registeredBalanceMinor).toBeNull();
    expect(report.coverage.unconfiguredAccountIds).toEqual(['cash', 'bank']);
    const negative = sources();
    negative.links = [];
    negative.transfers = [];
    expect(mapFinanceReport(actor, query, 'America/Asuncion', negative, instant(10)).accounts[0]).toMatchObject({ balanceMinor: -200000, negative: true });
  });

  it('uses local today for current overdue status, and maintains a stable token independently from asOf', () => {
    const fixture = sources();
    fixture.expenses[0].reference = 'Evidencia registrada';
    const first = mapFinanceReport(actor, query, 'America/Asuncion', fixture, new Date('2026-10-04T01:00:00Z'));
    const second = mapFinanceReport(actor, query, 'America/Asuncion', fixture, new Date('2026-10-04T02:00:00Z'));
    expect(first.expenses[0].overdue).toBe(false);
    expect(first.coverage.missingEvidenceExpenseIds).toEqual([]);
    expect(first.token).toBe(second.token);
    expect(first.asOf).not.toBe(second.asOf);
    expect(mapFinanceReport(actor, query, 'America/Asuncion', fixture, new Date('2026-10-04T03:00:00Z')).token).not.toBe(first.token);
    fixture.expenses[0].dueOn = null;
    expect(mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10)).expenses[0].overdue).toBe(false);
  });

  it('keeps no-account balance unknown and identifies current review metadata', () => {
    const fixture = sources();
    fixture.accounts = [];
    fixture.reviews[0].sourceVersion = 2;
    fixture.reviewOccurredAt.review = instant(8).toISOString();
    const report = mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10));
    expect(report.totals.registeredBalanceMinor).toBeNull();
    expect(report.movements.find((row) => row.sourceType === 'PAYMENT')).toMatchObject({ reviewed: true, reviewStale: false, reviewDetails: { occurredAt: instant(8).toISOString() } });
    fixture.reviewOccurredAt = {};
    expect(mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10)).movements.find((row) => row.sourceType === 'PAYMENT')).toMatchObject({ reviewDetails: null });
    fixture.reviews = [];
    expect(mapFinanceReport(actor, query, 'America/Asuncion', fixture, instant(10)).movements.find((row) => row.sourceType === 'PAYMENT')).toMatchObject({ reviewDetails: null, reviewVersion: 0, reviewed: false });
  });
});
