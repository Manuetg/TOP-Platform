import type { Prisma } from '@prisma/client';
import { assertFinancePeriodOpen, FinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import { appendBookingTimelineEvent } from '../../booking/booking.contract';
import { TerminalFinalAmountConflictError, TerminalFinalAmountForbiddenError, TerminalFinalAmountInputError, TerminalFinalAmountNotFoundError, type TerminalFinalAmountInput } from '../domain/terminal-final-amount';
import type { CurrentPricing } from '../domain/current-pricing';
import type { PricingSnapshotItem } from '../domain/pricing-snapshot.repository';
import { readCurrentPricing, readServicePricing, type ServicePricing } from './prisma-current-pricing.reader';
import { appendTerminalFinalAmount } from './prisma-terminal-final-amount.writer';

jest.mock('../../../shared/infrastructure/finance-period.guard', () => ({ ...jest.requireActual<typeof import('../../../shared/infrastructure/finance-period.guard')>('../../../shared/infrastructure/finance-period.guard'), assertFinancePeriodOpen: jest.fn() }));
jest.mock('../../booking/booking.contract', () => ({ ...jest.requireActual<typeof import('../../booking/booking.contract')>('../../booking/booking.contract'), appendBookingTimelineEvent: jest.fn() }));
jest.mock('./prisma-current-pricing.reader', () => ({ ...jest.requireActual<typeof import('./prisma-current-pricing.reader')>('./prisma-current-pricing.reader'), readCurrentPricing: jest.fn(), readServicePricing: jest.fn() }));

const businessId = 'business'; const bookingId = 'booking'; const actorUserId = 'owner';
const now = new Date('2026-10-05T12:00:00.000Z'); const updatedAt = new Date('2026-10-01T10:00:00.000Z');
const item: PricingSnapshotItem = { resourceId: 'resource', ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 1000, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acuerdo de servicio original', nights: 1, breakdown: [] };
const current: CurrentPricing = { id: 'service-revision', businessId, bookingId, originalSnapshotId: 'original-snapshot', pricingRevisionId: 'service-revision', revisionNumber: 1, currency: 'PYG', totalAmountMinor: 1000, items: [item], createdAt: new Date('2026-09-01') };
const originalState = { currency: 'PYG', grossRecordedAmountMinor: 1000n, voidedAmountMinor: 0n, refundedAmountMinor: 250n, netRetainedAmountMinor: 750n, paymentVersion: 2n, invalidMonetaryData: false, applicationInvalid: false };
const command = (overrides: Partial<TerminalFinalAmountInput> = {}): TerminalFinalAmountInput => ({ businessId, bookingId, actorUserId, requestId: 'request-uuid', expectedBookingUpdatedAt: updatedAt.toISOString(), currentPricingId: current.id, expectedFinancialVersion: 2, finalAmountMinor: 0, reason: '  Importe final acordado  ', ...overrides });
interface BookingFixture { id: string; businessId: string; status: string; updatedAt: Date; contactId: string | null; checkInDate: Date | null; checkOutDate: Date | null; resources: { resourceId: string }[]; adults: number; children: number }
interface WriterFixtureState { booking: BookingFixture | null; current: CurrentPricing | null; service: ServicePricing | null; userStatus: string | null; role: string | null; businessStatus: string; businessCurrency: string; currentKind: string | null; effective: typeof originalState[]; localDate: string | null }

function fixture() {
  const state: WriterFixtureState = { booking: { id: bookingId, businessId, status: 'CANCELLED', updatedAt, contactId: 'contact', checkInDate: new Date('2026-10-01'), checkOutDate: new Date('2026-10-02'), resources: [{ resourceId: 'resource' }], adults: 1, children: 0 }, current: { ...current, items: [{ ...item }] }, service: { ...current, items: [{ ...item }], kind: 'SERVICE', sourceKind: 'REVISION', sourceContext: { checkInDate: '2026-10-01', checkOutDate: '2026-10-02', resourceIds: ['resource'] } }, userStatus: 'ACTIVE', role: 'OWNER', businessStatus: 'ACTIVE', businessCurrency: 'PYG', currentKind: 'SERVICE', effective: [{ ...originalState }], localDate: '2026-10-05' };
  const raw = jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>().mockImplementation(query => Promise.resolve(sqlResult(query.join('?'), state)));
  const findBooking = jest.fn<Promise<BookingFixture | null>, [unknown]>().mockImplementation(() => Promise.resolve(state.booking));
  const findKind = jest.fn<Promise<{ kind: string } | null>, [unknown]>().mockImplementation(() => Promise.resolve(state.currentKind === null ? null : { kind: state.currentKind }));
  const createRevision = jest.fn<Promise<{ id: string }>, [Prisma.PricingRevisionCreateArgs]>().mockResolvedValue({ id: 'new-terminal-revision' });
  const updateBooking = jest.fn<Promise<{ id: string }>, [Prisma.BookingUpdateArgs]>().mockResolvedValue({ id: bookingId });
  const transaction = { $queryRaw: raw, booking: { findFirst: findBooking, update: updateBooking }, pricingRevision: { findFirst: findKind, create: createRevision } };
  jest.mocked(readCurrentPricing).mockImplementation(() => Promise.resolve(state.current));
  jest.mocked(readServicePricing).mockImplementation(() => Promise.resolve(state.service));
  return { state, raw, transaction: transaction as unknown as Prisma.TransactionClient, findBooking, findKind, createRevision, updateBooking };
}

function sqlResult(sql: string, state: WriterFixtureState): unknown[] {
  if (sql.includes('"UserBusinessMembership"')) return optionalRow('role', state.role);
  if (sql.includes('"User"')) return optionalRow('status', state.userStatus);
  if (sql.includes('FROM "PaymentEffectiveState"')) return state.effective;
  if (sql.includes('to_char(clock_timestamp()')) return optionalRow('date', state.localDate);
  if (sql.includes('SELECT status,currency FROM "Business"')) return [{ status: state.businessStatus, currency: state.businessCurrency }];
  if (sql.includes('FROM "Booking"') || sql.includes('FROM "PricingSnapshot"')) return [{ id: bookingId }];
  throw new Error('UNEXPECTED_TERMINAL_TEST_QUERY');
}

function optionalRow(key: string, value: string | null): unknown[] { return value === null ? [] : [{ [key]: value }]; }

function expectNoEconomicWrite(f: ReturnType<typeof fixture>): void { expect(f.createRevision).not.toHaveBeenCalled(); expect(f.updateBooking).not.toHaveBeenCalled(); expect(appendBookingTimelineEvent).not.toHaveBeenCalled(); }
beforeEach(() => { jest.resetAllMocks(); jest.useFakeTimers().setSystemTime(now); jest.mocked(assertFinancePeriodOpen).mockResolvedValue(undefined); jest.mocked(appendBookingTimelineEvent).mockResolvedValue(undefined); });
afterEach(() => jest.useRealTimers());

describe('appendTerminalFinalAmount direct financial writer', () => {
  it.each(['CANCELLED', 'NO_SHOW'])('persists explicit final zero for %s once with immutable service snapshot, net paid750, exact scoped CAS and minimal timeline', async status => {
    const f = fixture(); f.state.booking!.status = status; const preservedService = structuredClone(f.state.service); const result = await appendTerminalFinalAmount(f.transaction, command());
    expect(result).toEqual({ id: 'new-terminal-revision', type: 'SET_TERMINAL_FINAL_AMOUNT', version: 2, bookingId, currentPricingId: 'new-terminal-revision', pricingRevisionId: 'new-terminal-revision', revisionNumber: 2, totalAmountMinor: 0, financialVersion: 2, amounts: { grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 250, netRetainedAmountMinor: 750, financialVersion: 2 }, bookingUpdatedAt: now.toISOString() });
    expect(f.createRevision).toHaveBeenCalledTimes(1);
    const data = f.createRevision.mock.calls[0][0].data;
    expect(data).toMatchObject({ businessId, bookingId, originalSnapshotId: 'original-snapshot', kind: 'TERMINAL_FINAL_AMOUNT', requestId: 'request-uuid', revisionNumber: 2, currency: 'PYG', totalAmountMinor: 0n, items: [], paidAmountMinorAtSave: 750n, actorUserId, reason: 'Importe final acordado' });
    expect(data.previousPricing).toEqual({ id: current.id, kind: 'SERVICE', currency: 'PYG', totalAmountMinor: 1000, items: [item] });
    expect(data.beforeContext).toEqual({ status, contactId: 'contact', checkInDate: '2026-10-01', checkOutDate: '2026-10-02', resourceIds: ['resource'], adults: 1, children: 0, previousPricingId: current.id, servicePricingId: current.id, financialVersion: 2, financialAmounts: result.amounts });
    expect(data.afterContext).toEqual({ ...data.beforeContext as Prisma.JsonObject, finalAmountMinor: 0 });
    expect(f.state.service).toEqual(preservedService); expect(f.state.current).toEqual(current); expect(f.state.booking!.updatedAt).toEqual(updatedAt);
    expect(f.findBooking).toHaveBeenCalledWith({ where: { id: bookingId, businessId }, include: { resources: true } });
    expect(readCurrentPricing).toHaveBeenCalledWith(f.transaction, businessId, bookingId); expect(readServicePricing).toHaveBeenCalledWith(f.transaction, businessId, bookingId);
    expect(f.findKind).toHaveBeenCalledWith({ where: { id: current.id, businessId, bookingId }, select: { kind: true } });
    expect(assertFinancePeriodOpen).toHaveBeenCalledWith(f.transaction, businessId, ['2026-10-05'], [{ type: 'SERVICE_PRICING', id: current.id }]);
    expect(f.updateBooking).toHaveBeenCalledWith({ where: { id: bookingId }, data: { updatedAt: now } });
    expect(appendBookingTimelineEvent).toHaveBeenCalledTimes(1); expect(appendBookingTimelineEvent).toHaveBeenCalledWith(f.transaction, { businessId, bookingId, actorUserId, type: 'BOOKING_FINAL_AMOUNT_CONFIRMED', details: { revisionId: result.id } });
    expect(jest.mocked(assertFinancePeriodOpen).mock.invocationCallOrder[0]).toBeLessThan(f.createRevision.mock.invocationCallOrder[0]);
    expect(f.createRevision.mock.invocationCallOrder[0]).toBeLessThan(f.updateBooking.mock.invocationCallOrder[0]);
  });

  it('locks User, Membership, Booking, Business, then Snapshot before canonical payment reads without reversing the Finance order', async () => {
    const f = fixture(); await appendTerminalFinalAmount(f.transaction, command());
    expect(f.raw.mock.calls.slice(0, 5).map(([query]) => query.join('?'))).toEqual(['SELECT status FROM "User" WHERE id=? FOR SHARE', 'SELECT role FROM "UserBusinessMembership" WHERE "userId"=? AND "businessId"=? FOR SHARE', 'SELECT id FROM "Booking" WHERE id=? AND "businessId"=? FOR UPDATE', 'SELECT status,currency FROM "Business" WHERE id=? FOR SHARE', 'SELECT id FROM "PricingSnapshot" WHERE "bookingId"=? AND "businessId"=? FOR UPDATE']);
    expect(f.raw.mock.calls.slice(0, 5).map(call => call.slice(1))).toEqual([[actorUserId], [actorUserId, businessId], [bookingId, businessId], [businessId], [bookingId, businessId]]);
    const paymentRead = f.raw.mock.calls.find(([query]) => query.join('?').includes('FROM "PaymentEffectiveState"')); expect(paymentRead?.slice(1)).toEqual([businessId, bookingId]);
  });

  it('classifies replacement of an existing terminal source separately and retains the earlier SERVICE basis', async () => {
    const f = fixture(); f.state.current = { ...current, id: 'previous-terminal', pricingRevisionId: 'previous-terminal', revisionNumber: 2, totalAmountMinor: 0, items: [] }; f.state.currentKind = 'TERMINAL_FINAL_AMOUNT';
    const result = await appendTerminalFinalAmount(f.transaction, command({ currentPricingId: 'previous-terminal', finalAmountMinor: 350 }));
    expect(result).toMatchObject({ revisionNumber: 3, totalAmountMinor: 350, financialVersion: 2 });
    expect(f.createRevision.mock.calls[0][0].data).toMatchObject({ totalAmountMinor: 350n, items: [], previousPricing: { id: 'previous-terminal', kind: 'TERMINAL_FINAL_AMOUNT', totalAmountMinor: 0, items: [] }, beforeContext: { previousPricingId: 'previous-terminal', servicePricingId: current.id } });
    expect(assertFinancePeriodOpen).toHaveBeenCalledWith(f.transaction, businessId, ['2026-10-05'], [{ type: 'TERMINAL_PRICING', id: 'previous-terminal' }]); expect(f.state.service?.id).toBe(current.id);
  });

  it('treats the original snapshot as implicit SERVICE without querying a nonexistent revision kind', async () => {
    const f = fixture(); f.state.current = { ...current, id: 'original-snapshot', pricingRevisionId: null, revisionNumber: 0 };
    const result = await appendTerminalFinalAmount(f.transaction, command({ currentPricingId: 'original-snapshot' }));
    expect(result.revisionNumber).toBe(1); expect(f.findKind).not.toHaveBeenCalled(); expect(assertFinancePeriodOpen).toHaveBeenCalledWith(f.transaction, businessId, ['2026-10-05'], [{ type: 'SERVICE_PRICING', id: 'original-snapshot' }]);
  });

  it.each([{ expectedBookingUpdatedAt: '2026-10-01T10:00:00.001Z' }, { currentPricingId: 'stale-price' }, { expectedFinancialVersion: 1 }])('rejects stale independent CAS %p before any write', async stale => {
    const f = fixture(); await expect(appendTerminalFinalAmount(f.transaction, command(stale))).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); expect(assertFinancePeriodOpen).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER', null])('revalidates membership %p before touching Booking or money', async role => {
    const f = fixture(); f.state.role = role; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountForbiddenError); expect(f.findBooking).not.toHaveBeenCalled(); expectNoEconomicWrite(f);
  });

  it('denies an inactive actor even when the membership is OWNER', async () => { const f = fixture(); f.state.userStatus = 'ARCHIVED'; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountForbiddenError); expectNoEconomicWrite(f); expect(f.findBooking).not.toHaveBeenCalled(); });
  it('hides a missing scoped Booking before reading Pricing or Payment', async () => { const f = fixture(); f.state.booking = null; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountNotFoundError); expect(readCurrentPricing).not.toHaveBeenCalled(); expectNoEconomicWrite(f); });
  it.each(['CONFIRMED', 'DRAFT', 'IN_PROGRESS'])('rejects nonterminal status %s', async status => { const f = fixture(); f.state.booking!.status = status; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });
  it('rejects a resource detached from the agreed service before reading effective payments', async () => { const f = fixture(); f.state.booking!.resources = [{ resourceId: 'different-resource' }]; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); expect(f.raw.mock.calls.some(([query]) => query.join('?').includes('PaymentEffectiveState'))).toBe(false); });

  it.each([{ status: 'ARCHIVED', currency: 'PYG' }, { status: 'ACTIVE', currency: 'USD' }])('rejects invalid Business state %p before financial writes', async invalid => { const f = fixture(); f.state.businessStatus = invalid.status; f.state.businessCurrency = invalid.currency; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });
  it.each(['current', 'service'] as const)('requires persisted PYG %s price without replacing the service amount', async source => { const f = fixture(); f.state[source]!.currency = 'USD'; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });
  it.each([{ currency: 'USD' }, { invalidMonetaryData: true }, { applicationInvalid: true }, { netRetainedAmountMinor: -1n }, { paymentVersion: 0n }])('rejects an invalid canonical payment fact %p', async invalid => { const f = fixture(); f.state.effective = [{ ...originalState, ...invalid }]; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });

  it('sums all original payment versions and persists retained net850 instead of historical gross1100', async () => {
    const f = fixture(); f.state.effective.push({ ...originalState, grossRecordedAmountMinor: 100n, refundedAmountMinor: 0n, netRetainedAmountMinor: 100n, paymentVersion: 1n });
    const result = await appendTerminalFinalAmount(f.transaction, command({ expectedFinancialVersion: 3, finalAmountMinor: 100 }));
    expect(result.amounts).toEqual({ grossRecordedAmountMinor: 1100, voidedAmountMinor: 0, refundedAmountMinor: 250, netRetainedAmountMinor: 850, financialVersion: 3 }); expect(f.createRevision.mock.calls[0][0].data.paidAmountMinorAtSave).toBe(850n);
  });

  it.each([2147483647, Number.MAX_SAFE_INTEGER])('rejects exhausted revision counter %p before guard or writes', async revisionNumber => { const f = fixture(); f.state.current!.revisionNumber = revisionNumber; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); expect(assertFinancePeriodOpen).not.toHaveBeenCalled(); });
  it('rejects a missing current kind rather than classifying an unrelated revision as service', async () => { const f = fixture(); f.state.currentKind = null; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });
  it('rejects a missing local terminal date before any write', async () => { const f = fixture(); f.state.localDate = null; await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(TerminalFinalAmountConflictError); expectNoEconomicWrite(f); });
  it('propagates a closed financial period before revision, Booking update or timeline', async () => { const f = fixture(); jest.mocked(assertFinancePeriodOpen).mockRejectedValueOnce(new FinancePeriodClosedError()); await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBeInstanceOf(FinancePeriodClosedError); expectNoEconomicWrite(f); });
  it('propagates a revision persistence failure without updating Booking or recording timeline', async () => { const f = fixture(); const failure = new Error('REVISION_WRITE_FAILED'); f.createRevision.mockRejectedValueOnce(failure); await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBe(failure); expect(f.updateBooking).not.toHaveBeenCalled(); expect(appendBookingTimelineEvent).not.toHaveBeenCalled(); });
  it('propagates timeline failure to the outer transaction; the mock does not claim database rollback', async () => { const f = fixture(); const failure = new Error('TIMELINE_WRITE_FAILED'); jest.mocked(appendBookingTimelineEvent).mockRejectedValueOnce(failure); await expect(appendTerminalFinalAmount(f.transaction, command())).rejects.toBe(failure); expect(f.createRevision).toHaveBeenCalledTimes(1); expect(f.updateBooking).toHaveBeenCalledTimes(1); });
  it('advances Booking timestamp by one millisecond even when its observed timestamp exceeds current server time', async () => { const f = fixture(); const future = new Date('2026-10-06T12:00:00.000Z'); f.state.booking!.updatedAt = future; const result = await appendTerminalFinalAmount(f.transaction, command({ expectedBookingUpdatedAt: future.toISOString() })); expect(result.bookingUpdatedAt).toBe('2026-10-06T12:00:00.001Z'); expect(f.updateBooking.mock.calls[0][0].data.updatedAt).toEqual(new Date('2026-10-06T12:00:00.001Z')); });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe final amount %p before identity locks', async finalAmountMinor => { const f = fixture(); await expect(appendTerminalFinalAmount(f.transaction, command({ finalAmountMinor }))).rejects.toBeInstanceOf(TerminalFinalAmountInputError); expect(f.raw).not.toHaveBeenCalled(); expectNoEconomicWrite(f); });
});
