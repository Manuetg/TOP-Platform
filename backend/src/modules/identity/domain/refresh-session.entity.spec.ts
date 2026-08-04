import { RefreshSession } from './refresh-session.entity';

describe('RefreshSession', () => {
  it('expone todos los datos de una sesión con valores distintivos', () => {
    const expiresAt = new Date('2026-02-01');
    const createdAt = new Date('2026-01-01');
    const updatedAt = new Date('2026-01-02');
    const session = RefreshSession.create({ id: 'session-id', userId: 'user-id', tokenHash: 'hash-value', expiresAt, revokedAt: null, replacedBySessionId: 'next-session-id', createdAt, updatedAt });
    expect(session.id).toBe('session-id');
    expect(session.userId).toBe('user-id');
    expect(session.tokenHash).toBe('hash-value');
    expect(session.expiresAt).toBe(expiresAt);
    expect(session.revokedAt).toBeNull();
    expect(session.replacedBySessionId).toBe('next-session-id');
    expect(session.createdAt).toBe(createdAt);
    expect(session.updatedAt).toBe(updatedAt);
  });
});
