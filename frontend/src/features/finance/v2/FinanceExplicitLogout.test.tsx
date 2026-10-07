import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiTransportError } from '../../../shared/api/api-client';
import { AuthProvider, useAuth } from '../../auth/context/AuthContext';
import type { LoginResponse } from '../../auth/types/auth.types';
import { clearFinanceIntentMemory, useFinanceIntent } from './use-finance-intent';

const storage = vi.hoisted(() => ({ write: vi.fn(), clear: vi.fn() }));
vi.mock('../../auth/storage/auth-session-storage', () => ({ readPersistedAuthSession: () => null, writePersistedAuthSession: storage.write, clearPersistedAuthSession: storage.clear }));
vi.mock('../../auth/api/logout', () => ({ logout: vi.fn().mockResolvedValue(undefined) }));
let observed: ReturnType<typeof useAuth>;
function Observer() { observed = useAuth(); return null; }
afterEach(() => { cleanup(); clearFinanceIntentMemory(); vi.clearAllMocks(); });

it('AuthProvider.logout explícito borra bytes y claves en memoria sin escribirlos al storage de sesión', async () => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(<QueryClientProvider client={client}><AuthProvider><Observer /></AuthProvider></QueryClientProvider>);
  const session: LoginResponse = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', tokenType: 'Bearer', expiresIn: 900, user: { id: 'explicit-owner', email: 'owner@example.test', status: 'ACTIVE' }, memberships: [{ businessId: 'explicit-business', role: 'OWNER' }] };
  act(() => observed.establishSession(session));
  const executor = vi.fn().mockRejectedValue(new ApiTransportError());
  const hook = renderHook(() => useFinanceIntent({ userId: session.user.id, businessId: 'explicit-business', accessToken: session.accessToken }, 'evidence:explicit-expense', executor), { wrapper });
  const file = { bytesBase64: 'AQID', sha256: 'private-original-hash', filename: 'Private.pdf', expectedVersion: 1 };
  await act(async () => { await expect(hook.result.current.execute(file)).rejects.toBeInstanceOf(ApiTransportError); });
  expect(hook.result.current.pendingCommand).toEqual(file);
  expect(storage.write).toHaveBeenCalledWith(session, 'SESSION');
  expect(storage.write.mock.calls.every((args) => !JSON.stringify(args).includes('bytesBase64'))).toBe(true);
  await act(async () => { await observed.logout(); });
  expect(observed.status).toBe('unauthenticated');
  expect(hook.result.current.pendingCommand).toBeNull();
  await expect(hook.result.current.retry()).rejects.toThrow('No hay un registro pendiente');
  expect(executor).toHaveBeenCalledTimes(1);
  client.clear();
});
