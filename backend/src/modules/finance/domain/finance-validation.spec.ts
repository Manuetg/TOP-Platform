import { FinanceInputError } from './finance.errors';
import { parseFinanceCommand, parseFinanceIdempotencyKey, parseFinanceQuery, parseFinanceUuid } from './finance-validation';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const AT = '2026-10-01T00:30:00-03:00';
const OPENING = { amountMinor: 1000000, occurredAt: AT, reason: 'Saldo documentado' };
const SETTLEMENT = { accountId: ID, amountMinor: 300000, occurredAt: AT };
const LINE = { label: 'Reparación', categoryId: ID, amountMinor: 900000, operational: true };
const EXPENSE = { type: 'CREATE_EXPENSE', description: 'Reparación', consumedOn: '2026-09-30', amountMinor: 900000, lines: [LINE] };
const VALID_COMMANDS: Record<string, unknown>[] = [
  { type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'Mantenimiento' },
  { type: 'ARCHIVE_CATALOG', id: ID, expectedVersion: 1, reason: 'Ya no se usa' },
  { type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja', opening: OPENING },
  { type: 'ARCHIVE_ACCOUNT', id: ID, expectedVersion: 1, reason: 'Cambio operativo' },
  { type: 'OPEN_ACCOUNT', id: ID, expectedVersion: 1, opening: OPENING },
  EXPENSE,
  { type: 'SETTLE_EXPENSE', id: ID, expectedVersion: 1, settlement: SETTLEMENT },
  { type: 'SET_EVIDENCE', id: ID, expectedVersion: 1, reference: 'Comprobante 10', reason: 'Referencia recibida' },
  { type: 'LINK_PAYMENT', paymentId: ID, accountId: OTHER, expectedVersion: 0, reason: 'Cobrado en caja' },
  { type: 'TRANSFER', fromAccountId: ID, toAccountId: OTHER, amountMinor: 300000, occurredAt: AT, reason: 'Reposición' },
  { type: 'CASH_MOVEMENT', accountId: ID, kind: 'WITHDRAWAL', amountMinor: 200000, occurredAt: AT, reason: 'Retiro propietario' },
  { type: 'REVIEW_MOVEMENT', sourceType: 'PAYMENT', sourceId: ID, sourceVersion: 1, expectedVersion: 0, reviewed: true, reason: 'Evidencia cotejada' },
  { type: 'COUNT_CASH', accountId: ID, occurredAt: AT, countedAmountMinor: 995000, reason: 'Cierre de turno' },
  { type: 'ADJUST_COUNT', id: ID, expectedVersion: 1, reason: 'Diferencia explicada' },
];

describe('Finance strict commands', () => {
  it.each(VALID_COMMANDS)('accepts the $type contract', input => {
    expect(parseFinanceCommand(input).type).toBe(input.type);
  });

  it.each(VALID_COMMANDS)('rejects extra monetary or actor fields on $type', input => {
    expect(() => parseFinanceCommand({ ...input, currency: 'USD' })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...input, actorUserId: OTHER })).toThrow(FinanceInputError);
  });

  it.each([null, undefined, [], 42, 'CREATE_ACCOUNT', new Date(), { type: 'BOGUS' }, { type: 'toString' }, {}])(
    'rejects invalid command shape %j', value => expect(() => parseFinanceCommand(value)).toThrow(FinanceInputError),
  );

  it('rejects symbol and nonplain inherited inputs', () => {
    expect(() => parseFinanceCommand({ ...EXPENSE, [Symbol('hidden')]: true })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand(Object.create(EXPENSE) as unknown)).toThrow(FinanceInputError);
  });

  it('normalizes optional fields, text, IDs and instants without changing pure dates', () => {
    expect(parseFinanceCommand({ ...EXPENSE, description: ' Reparación ', settlement: SETTLEMENT })).toEqual({
      ...EXPENSE, dueOn: null, counterpartyId: null, reference: null,
      lines: [{ ...LINE, resourceId: null }],
      settlement: { ...SETTLEMENT, occurredAt: '2026-10-01T03:30:00.000Z', reference: null },
    });
    expect(parseFinanceUuid('ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF')).toBe('abcdefab-abcd-4abc-8abc-abcdefabcdef');
    expect(() => parseFinanceUuid(` ${ID}`)).toThrow(FinanceInputError);
    expect(() => parseFinanceUuid('not-an-id')).toThrow(FinanceInputError);
  });

  it('preserves the complete inline opening when creating an account', () => {
    expect(parseFinanceCommand({
      type: 'CREATE_ACCOUNT', kind: 'CASH', name: ' Caja de recepción ',
      opening: { amountMinor: 1000000, occurredAt: AT, reason: ' Saldo documentado ' },
    })).toEqual({
      type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja de recepción',
      opening: { amountMinor: 1000000, occurredAt: '2026-10-01T03:30:00.000Z', reason: 'Saldo documentado' },
    });
  });

  it.each(['', ' ', 'x'.repeat(81), 42, 'Nombre\u0000oculto', 'Nombre\nsegunda línea'])(
    'rejects invalid trimmed name %j', name => {
      expect(() => parseFinanceCommand({ type: 'CREATE_CATALOG', kind: 'CATEGORY', name })).toThrow(FinanceInputError);
    },
  );

  it('applies distinct limits and requires actual boolean line classification', () => {
    expect(() => parseFinanceCommand({ ...EXPENSE, description: 'x'.repeat(241) })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, lines: [{ ...LINE, label: 'x'.repeat(121) }] })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, reference: 'x'.repeat(501) })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[1], reason: 'x'.repeat(501) })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, lines: [{ ...LINE, operational: 'false' }] })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[11], reviewed: 1 })).toThrow(FinanceInputError);
  });

  it('keeps a reference as literal private text, supports clearing and rejects malformed nullable fields', () => {
    expect(parseFinanceCommand({ ...EXPENSE, reference: ' https://private.invalid/invoice ' })).toMatchObject({ reference: 'https://private.invalid/invoice' });
    expect(parseFinanceCommand({ ...VALID_COMMANDS[7], reference: null })).toMatchObject({ reference: null });
    expect(() => parseFinanceCommand({ ...EXPENSE, counterpartyId: 'wrong' })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, dueOn: 'wrong' })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, reference: false })).toThrow(FinanceInputError);
  });

  it('accepts active and nonoperative split with an exact deterministic remainder', () => {
    const lines = [{ ...LINE, amountMinor: 60000 }, { ...LINE, label: 'No operativo', amountMinor: 40001, operational: false, resourceId: OTHER }];
    expect(parseFinanceCommand({ ...EXPENSE, amountMinor: 100001, lines })).toMatchObject({ amountMinor: 100001, lines });
    expect(() => parseFinanceCommand({ ...EXPENSE, amountMinor: 100001, lines: [{ ...lines[0] }, { ...lines[1], amountMinor: 40000 }] })).toThrow(FinanceInputError);
  });

  it('rejects accumulated overflow, excess initial payment and unsupported nested keys', () => {
    expect(() => parseFinanceCommand({ ...EXPENSE, amountMinor: Number.MAX_SAFE_INTEGER, lines: [{ ...LINE, amountMinor: Number.MAX_SAFE_INTEGER }, { ...LINE, amountMinor: 1 }] })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, settlement: { ...SETTLEMENT, amountMinor: 900001 } })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, lines: [{ ...LINE, currency: 'PYG' }] })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...EXPENSE, settlement: { ...SETTLEMENT, paymentId: ID } })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[4], opening: { ...OPENING, currency: 'PYG' } })).toThrow(FinanceInputError);
  });

  it.each([[], Array.from({ length: 51 }, () => LINE), null, 'line'])(
    'rejects invalid line count/shape %j', lines => expect(() => parseFinanceCommand({ ...EXPENSE, lines })).toThrow(FinanceInputError),
  );

  it('admits exactly 50 positive lines', () => {
    const lines = Array.from({ length: 50 }, () => ({ ...LINE, amountMinor: 1 }));
    expect(parseFinanceCommand({ ...EXPENSE, amountMinor: 50, lines })).toMatchObject({ amountMinor: 50 });
  });

  it.each([0, -1, 1.25, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '900000'])(
    'rejects nonpositive or unsafe expense %s', amountMinor => {
      expect(() => parseFinanceCommand({ ...EXPENSE, amountMinor, lines: [{ ...LINE, amountMinor }] })).toThrow(FinanceInputError);
    },
  );

  it('enforces nonnegative exact versions and zero only for initial link/review', () => {
    for (const input of VALID_COMMANDS.filter(item => Object.hasOwn(item, 'expectedVersion'))) {
      expect(() => parseFinanceCommand({ ...input, expectedVersion: -1 })).toThrow(FinanceInputError);
      expect(() => parseFinanceCommand({ ...input, expectedVersion: 0.5 })).toThrow(FinanceInputError);
    }
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[1], expectedVersion: 0 })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[11], sourceVersion: 0 })).toThrow(FinanceInputError);
  });

  it('supports signed openings/adjustments, zero cash count, and rejects invalid use', () => {
    expect(parseFinanceCommand({ ...VALID_COMMANDS[4], opening: { ...OPENING, amountMinor: -200 } })).toMatchObject({ opening: { amountMinor: -200 } });
    expect(parseFinanceCommand({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco' })).toMatchObject({ opening: null });
    expect(parseFinanceCommand({ ...VALID_COMMANDS[4], opening: { ...OPENING, amountMinor: 0 } })).toMatchObject({ opening: { amountMinor: 0 } });
    expect(parseFinanceCommand({ ...VALID_COMMANDS[10], kind: 'ADJUSTMENT', amountMinor: -5000, openingId: OTHER })).toMatchObject({ amountMinor: -5000, openingId: OTHER });
    expect(parseFinanceCommand({ ...VALID_COMMANDS[12], countedAmountMinor: 0 })).toMatchObject({ countedAmountMinor: 0 });
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[10], kind: 'ADJUSTMENT', amountMinor: 0 })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[10], openingId: OTHER })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[10], amountMinor: -200 })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[9], toAccountId: ID })).toThrow(FinanceInputError);
    expect(() => parseFinanceCommand({ ...VALID_COMMANDS[0], kind: 'CASH' })).toThrow(FinanceInputError);
  });
});

describe('Finance dates and query cut', () => {
  it.each(['0001-01-01', '0099-01-01', '2000-02-29', '2024-02-29', '2026-09-30'])(
    'preserves valid pure date %s', consumedOn => {
      expect(parseFinanceCommand({ ...EXPENSE, consumedOn })).toMatchObject({ consumedOn });
    },
  );

  it.each(['0000-01-01', '1900-02-29', '2025-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', null, 20260101])(
    'rejects invalid pure date %j', consumedOn => {
      expect(() => parseFinanceCommand({ ...EXPENSE, consumedOn })).toThrow(FinanceInputError);
    },
  );

  it.each(['2026-10-01T00:00:00', '2026-02-30T00:00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T00:60:00Z', '2026-10-01T00:00:60Z', '2026-10-01T00:00:00+24:00', '2026-10-01T00:00:00+03:60', '2026-10-01T00:00:00.1234Z', '0001-01-01T00:00:00+03:00', '9999-12-31T23:59:59-03:00', null])(
    'rejects ambiguous/invalid instant %j', occurredAt => {
      expect(() => parseFinanceCommand({ ...VALID_COMMANDS[9], occurredAt })).toThrow(FinanceInputError);
    },
  );

  it.each(['2026-10-01T00:00:00Z', '2026-10-01T00:00:00.1Z', '2026-10-01T00:00:00+03:30', '0099-01-01T00:00:00Z'])(
    'normalizes valid instant %s', occurredAt => {
      expect(parseFinanceCommand({ ...VALID_COMMANDS[9], occurredAt })).toMatchObject({ occurredAt: new Date(occurredAt).toISOString() });
    },
  );

  it('accepts inclusive lower limit and leap-year maximum span with exclusive upper date', () => {
    expect(parseFinanceQuery('2026-09-30', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-10-01' });
    expect(parseFinanceQuery('2024-01-01', '2025-01-01')).toEqual({ from: '2024-01-01', to: '2025-01-01' });
  });

  it.each([['2026-10-01', '2026-10-01'], ['2026-10-02', '2026-10-01'], ['2024-01-01', '2025-01-02'], [null, '2026-10-01']])(
    'rejects query interval (%s,%s)', (from, to) => expect(() => parseFinanceQuery(from, to)).toThrow(FinanceInputError),
  );
});

describe('Finance idempotency keys', () => {
  it.each(['abcdefghijklmnop', 'finance_2026.10-01', 'x'.repeat(128)])('preserves valid key %s', key => {
    expect(parseFinanceIdempotencyKey(key)).toBe(key);
  });
  it.each(['short', 'x'.repeat(129), 'abcdefghijklmnop ', 'abcdefghijklmnop/', '', null, 42])(
    'rejects invalid key %j', key => expect(() => parseFinanceIdempotencyKey(key)).toThrow(FinanceInputError),
  );
});
