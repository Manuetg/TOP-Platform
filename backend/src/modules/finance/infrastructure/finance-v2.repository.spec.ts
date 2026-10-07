import type { FinanceV2Mutation, FinanceV2Result } from '../domain/finance-v2.types';
import { FinanceV2Repository, type FinanceSqlTransaction, type FinanceV2CommandHandler, type FinanceV2RepositoryGuards } from './finance-v2.repository';

const command: FinanceV2Mutation = { businessId: 'business1', actorUserId: 'owner1', idempotencyKey: 'intent1', fingerprint: 'hash1', command: { type: 'CREATE_COMMITMENT', description: 'Mantenimiento', amountMinor: 900000, categoryId: null, resourceId: null, expectedConsumptionOn: '2026-10-10', dueOn: '2026-10-10', operational: true, reference: null, reason: 'Plan declarado' } };

function fixture() {
  const state = { user: 'ACTIVE', role: 'OWNER', business: 'ACTIVE', requests: [] as { fingerprint: string; result: FinanceV2Result }[], audits: [] as unknown[], effects: 0, failRequest: false };
  const locks: string[] = [];
  const tx: FinanceSqlTransaction = {
    query: <T extends object>(sql: string, parameters: readonly unknown[]) => {
      if (sql.includes('FROM "User"')) { locks.push('USER'); return Promise.resolve([{ status: state.user }] as unknown as T[]); }
      if (sql.includes('UserBusinessMembership')) { locks.push('MEMBERSHIP'); return Promise.resolve([{ role: state.role }] as unknown as T[]); }
      if (sql.includes('FROM "Booking"')) { locks.push(`BOOKING:${JSON.stringify(parameters[1])}`); return Promise.resolve((parameters[1] as string[]).map(id => ({ id })) as unknown as T[]); }
      if (sql.includes('FROM "Business"')) { locks.push('BUSINESS'); return Promise.resolve([{ status: state.business, currency: 'PYG' }] as unknown as T[]); }
      if (sql.includes('FROM "FinanceRequest"')) { locks.push('REQUEST'); return Promise.resolve(state.requests as unknown as T[]); }
      return Promise.reject(new Error(`SQL fixture inesperado: ${sql}`));
    },
    execute: (sql, parameters) => {
      if (sql.includes('FinanceAudit')) state.audits.push(JSON.parse(parameters[5] as string));
      if (sql.includes('FinanceRequest')) {
        if (state.failRequest) return Promise.reject(new Error('request insert failed'));
        state.requests.push({ fingerprint: parameters[4] as string, result: JSON.parse(parameters[5] as string) as FinanceV2Result });
      }
      return Promise.resolve(1);
    },
  };
  const host = { transaction: async <T>(work: (transaction: FinanceSqlTransaction) => Promise<T>) => {
    const prior = { requests: [...state.requests], audits: [...state.audits], effects: state.effects };
    try { return await work(tx); } catch (error) { Object.assign(state, prior); throw error; }
  } };
  const handler: FinanceV2CommandHandler = {
    commandTypes: ['CREATE_COMMITMENT', 'CONFIRM_HISTORY_IMPORT'],
    bookingReferences: () => Promise.resolve(['booking2', 'booking1', 'booking1']),
    execute: (_tx, input, lockedBookingIds) => {
      expect(lockedBookingIds.has('booking1')).toBe(true);
      state.effects += 1;
      return Promise.resolve({ id: 'source1', version: 1, type: input.command.type });
    },
  };
  const guards: FinanceV2RepositoryGuards = { authorizeCapability: () => true, accumulations: () => Promise.resolve(undefined), closedPeriods: () => { locks.push('CLOSED_PERIOD_GUARD'); return Promise.resolve(); } };
  return { state, locks, host, handler, guards, repository: new FinanceV2Repository(host, [handler], guards) };
}

describe('Finance V2 transaction repository contract (unit fixture)', () => {
  it('locks current identity, sorted Booking refs, Business and period before creating facts', async () => {
    const f = fixture();
    await f.repository.execute(command);
    expect(f.locks).toEqual(['USER', 'MEMBERSHIP', 'BOOKING:["booking1","booking2"]', 'BUSINESS', 'REQUEST', 'CLOSED_PERIOD_GUARD']);
    expect(f.state.effects).toBe(1);
    expect(f.state.audits).toHaveLength(1);
    expect(f.state.requests).toHaveLength(1);
  });
  it('replays the original exact result after another state change without another effect', async () => {
    const f = fixture();
    const original = await f.repository.execute(command);
    f.state.business = 'ARCHIVED';
    expect(await f.repository.execute(command)).toEqual(original);
    expect(f.state.effects).toBe(1);
    expect(f.state.audits).toHaveLength(1);
  });
  it('denies a different payload fingerprint using an already confirmed key', async () => {
    const f = fixture();
    await f.repository.execute(command);
    await expect(f.repository.execute({ ...command, fingerprint: 'other' })).rejects.toThrow('otra intención');
    expect(f.state.effects).toBe(1);
  });
  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('does not inherit Finance from role %s', async role => {
    const f = fixture(); f.state.role = role;
    await expect(f.repository.execute(command)).rejects.toThrow('no autorizado');
    expect(f.state.effects).toBe(0);
    expect(f.state.requests).toHaveLength(0);
  });
  it('revocation also prevents reading a prior result', async () => {
    const f = fixture(); await f.repository.execute(command); f.state.user = 'DISABLED';
    f.locks.length = 0;
    await expect(f.repository.execute(command)).rejects.toThrow('no autorizado');
    expect(f.locks).toEqual(['USER']);
  });
  it('rolls back an effect and audit when the last request insert fails', async () => {
    const f = fixture(); f.state.failRequest = true;
    await expect(f.repository.execute(command)).rejects.toThrow('request insert failed');
    expect(f.state.effects).toBe(0);
    expect(f.state.audits).toHaveLength(0);
    expect(f.state.requests).toHaveLength(0);
    f.state.failRequest = false; await f.repository.execute(command);
    expect(f.state.effects).toBe(1);
  });
  it('keeps a closed-period rejection atomic before effects', async () => {
    const f = fixture(); f.guards.closedPeriods = () => Promise.reject(new Error('closed'));
    await expect(f.repository.execute(command)).rejects.toThrow('closed');
    expect(f.state.effects).toBe(0);
    expect(f.state.audits).toHaveLength(0);
  });
  it('stores provenance digest instead of a raw imported CSV in audit', async () => {
    const f = fixture();
    const csv = 'PRIVATE ROW,900000';
    await f.repository.execute({ ...command, command: { type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: 'manual', csv, previewToken: 'token', reason: 'Historial' } });
    expect(JSON.stringify(f.state.audits)).not.toContain(csv);
    expect(f.state.audits[0]).toMatchObject({ command: { type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: 'manual', csvDigest: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown } });
  });
  it('rejects a handler group that has not been implemented', () => {
    const f = fixture();
    expect(() => f.repository.execute({ ...command, command: { type: 'CANCEL_COMMITMENT', id: 'one', expectedVersion: 1, reason: 'Cancelación' } })).toThrow('no está implementado');
    expect(f.state.effects).toBe(0);
  });
});
