import { compareApplicationsForRelease, PaymentAdjustmentConflictError, PaymentAdjustmentInputError, PaymentAdjustmentInvariantError, planApplicationRelease, validatePaymentAdjustmentReason, validatePaymentAdjustmentReference, validateRefundAmount, validateRefundOccurredAt, type EffectiveApplicationForRelease } from './payment-adjustment.rules';

const row = (installmentId: string, effectiveAmountMinor: number, dueDate: string | null = '2026-10-01', sortOrder = 0): EffectiveApplicationForRelease => ({ installmentId, effectiveAmountMinor, dueDate, sortOrder });

describe('Payment adjustment application release', () => {
  it('Given credit400/app600 When refund300 Then no original application is released', () => {
    expect(planApplicationRelease(1000, 300, [row('a', 600)])).toEqual([]);
  });

  it('Given prior credit100/app600 When refund200 Then releases exactly100', () => {
    expect(planApplicationRelease(700, 200, [row('a', 600)])).toEqual([{ installmentId: 'a', amountMinor: 100 }]);
  });

  it('Given equal/null due dates When releasing Then uses null first and due/sort/id DESC with exact residue', () => {
    const apps = [row('a', 50), row('b', 70), row('c', 80, '2026-10-02'), row('d', 30, null), row('e', 40, null, 1)];
    expect(planApplicationRelease(270, 200, apps)).toEqual([
      { installmentId: 'e', amountMinor: 40 }, { installmentId: 'd', amountMinor: 30 },
      { installmentId: 'c', amountMinor: 80 }, { installmentId: 'b', amountMinor: 50 },
    ]);
    expect(apps.map((app) => app.effectiveAmountMinor)).toEqual([50, 70, 80, 30, 40]);
  });

  it('Given original fully voided When release entire net Then all effective applications are reversed', () => {
    expect(planApplicationRelease(1000, 1000, [row('a', 400), row('b', 200, null)])).toEqual([{ installmentId: 'b', amountMinor: 200 }, { installmentId: 'a', amountMinor: 400 }]);
  });

  it('Given applications exceed this Payment net When another Payment has credit Then fails this original invariant', () => {
    expect(() => planApplicationRelease(100, 1, [row('a', 101)])).toThrow(PaymentAdjustmentInvariantError);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid adjustment %s', (value) => {
    expect(() => planApplicationRelease(100, value, [])).toThrow(PaymentAdjustmentInvariantError);
  });

  it('rejects refund beyond net and invalid/duplicate application origins', () => {
    expect(() => planApplicationRelease(100, 101, [])).toThrow(PaymentAdjustmentConflictError);
    expect(() => planApplicationRelease(100, 1, [row('a', 1), row('a', 2)])).toThrow(PaymentAdjustmentInvariantError);
    expect(() => planApplicationRelease(100, 1, [row('a', 1, '2026-02-30')])).toThrow(PaymentAdjustmentInvariantError);
    expect(() => planApplicationRelease(100, 1, [row('a', 1, null, -1)])).toThrow(PaymentAdjustmentInvariantError);
    expect(() => planApplicationRelease(100, 1, [row('', 1)])).toThrow(PaymentAdjustmentInvariantError);
  });

  it('covers comparator equivalence and inverse date/order/id without locale dependence', () => {
    expect(compareApplicationsForRelease(row('a', 1), row('a', 2))).toBe(0);
    expect(compareApplicationsForRelease(row('a', 1), row('b', 2))).toBe(1);
    expect(compareApplicationsForRelease(row('b', 1), row('a', 2))).toBe(-1);
    expect(compareApplicationsForRelease(row('a', 1, null), row('b', 2))).toBe(-1);
    expect(compareApplicationsForRelease(row('a', 1), row('b', 2, null))).toBe(1);
    expect(compareApplicationsForRelease(row('a', 1, '2026-10-02'), row('b', 2))).toBe(-1);
    expect(compareApplicationsForRelease(row('a', 1, '2026-10-01', 1), row('b', 2))).toBe(-1);
  });

  it('Given500 deterministic portfolios When refunding Then conserves net/applications and never mutates originals', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const apps = Array.from({ length: seed % 9 }, (_, index) => row(`id${index}`, (seed * (index + 1)) % 97, index % 3 === 0 ? null : `2026-10-${String(index + 1).padStart(2, '0')}`, index));
      const applied = apps.reduce((sum, app) => sum + app.effectiveAmountMinor, 0);
      const net = applied + seed % 101 + 1;
      const adjustment = seed % net + 1;
      const originals = JSON.stringify(apps);
      const result = planApplicationRelease(net, adjustment, apps);
      const release = result.reduce((sum, app) => sum + app.amountMinor, 0);
      expect(release).toBe(Math.max(adjustment - (net - applied), 0));
      expect(applied - release).toBeLessThanOrEqual(net - adjustment);
      expect(new Set(result.map((app) => app.installmentId)).size).toBe(result.length);
      expect(result.every((app) => Number.isSafeInteger(app.amountMinor) && app.amountMinor > 0 && app.amountMinor <= apps.find((source) => source.installmentId === app.installmentId)!.effectiveAmountMinor)).toBe(true);
      expect(JSON.stringify(apps)).toBe(originals);
    }
  });
});

describe('Payment adjustment validation', () => {
  it('normalizes mandatory reason and optional reference', () => {
    expect(validatePaymentAdjustmentReason('  Error de registro  ')).toBe('Error de registro');
    expect(validatePaymentAdjustmentReference('  Ref  ')).toBe('Ref');
    expect(validatePaymentAdjustmentReference('  ')).toBeNull();
    expect(validatePaymentAdjustmentReference(null)).toBeNull();
    expect(() => validatePaymentAdjustmentReason('x')).toThrow(PaymentAdjustmentInputError);
    expect(() => validatePaymentAdjustmentReason('x'.repeat(501))).toThrow(PaymentAdjustmentInputError);
    expect(() => validatePaymentAdjustmentReference('x'.repeat(121))).toThrow(PaymentAdjustmentInputError);
  });

  it('requires positive safe integer refund and explicit non-future/non-pre-payment date', () => {
    expect(validateRefundAmount(1)).toBe(1);
    for (const value of [0, -1, 1.1, NaN, Infinity, '100']) expect(() => validateRefundAmount(value)).toThrow(PaymentAdjustmentInputError);
    const paidAt = new Date('2026-10-01T12:00:00Z');
    const now = new Date('2026-10-05T12:00:00Z');
    expect(validateRefundOccurredAt('2026-10-05T09:00:00-03:00', paidAt, now)).toEqual(now);
    for (const value of ['2026-10-05', '2026-10-05T10:00:00', '2026-10-01T11:59:59Z', '2026-10-05T12:00:01Z', '2026-02-30T12:00:00Z', '2026-10-02T24:00:00Z', '2026-10-02T12:00:00+24:00']) expect(() => validateRefundOccurredAt(value, paidAt, now)).toThrow(PaymentAdjustmentInputError);
  });
});
