import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiTransportError } from '../../../shared/api/api-client';
import * as auth from '../../auth/context/AuthContext';
import * as business from '../../business/context/BusinessContext';
import { FinanceIntentSessionBoundary } from './FinanceIntentSessionBoundary';
import { clearFinanceIntentMemory, reconcileFinanceIntentAuthority, useFinanceIntent } from './use-finance-intent';

const context = { userId: 'scope-owner', businessId: 'scope-business', accessToken: 'old-token' };
const payload = { expenseId: 'scope-expense', filename: 'Private.pdf', bytesBase64: 'AQID', sha256: 'original-hash', expectedVersion: 1 };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
afterEach(() => { cleanup(); clearFinanceIntentMemory(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

it.each([
  { userId: context.userId, businessId: 'another-business', role: 'OWNER' },
  { userId: 'another-user', businessId: context.businessId, role: 'OWNER' },
  { userId: context.userId, businessId: context.businessId, role: 'ADMIN' },
])('autoridad confirmada distinta destruye bytes y clave de scopes anteriores: %j', async (authority) => {
  const executor = vi.fn().mockRejectedValue(new ApiTransportError());
  const hook = renderHook(() => useFinanceIntent(context, 'evidence:scope-expense', executor), setup());
  await act(async () => { await expect(hook.result.current.execute(payload)).rejects.toBeInstanceOf(ApiTransportError); });
  expect(hook.result.current.pendingCommand).toEqual(payload);
  act(() => reconcileFinanceIntentAuthority(authority));
  expect(hook.result.current.pendingCommand).toBeNull();
  await expect(hook.result.current.retry()).rejects.toThrow('No hay un registro pendiente');
  expect(executor).toHaveBeenCalledTimes(1);
});

it('logout explícito elimina también una carga en vuelo; su error posterior no repuebla memoria', async () => {
  let reject!: (error: Error) => void;
  const executor = vi.fn().mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const hook = renderHook(() => useFinanceIntent(context, 'evidence:scope-expense', executor), setup());
  let pending!: Promise<unknown>;
  await act(async () => { pending = hook.result.current.execute(payload); });
  expect(hook.result.current.isPending).toBe(true);
  act(clearFinanceIntentMemory);
  expect(hook.result.current.pendingCommand).toBeNull();
  await act(async () => { reject(new ApiTransportError()); await expect(pending).rejects.toBeInstanceOf(ApiTransportError); });
  expect(hook.result.current.hasUncertainResult).toBe(false);
  expect(hook.result.current.pendingCommand).toBeNull();
});

it('boundary conserva intención ante GET loading/error, 401 sin logout y renovación de token del mismo usuario', async () => {
  const executor = vi.fn().mockRejectedValue(new ApiTransportError());
  const hook = renderHook(() => useFinanceIntent(context, 'evidence:scope-expense', executor), setup());
  await act(async () => { await expect(hook.result.current.execute(payload)).rejects.toBeInstanceOf(ApiTransportError); });
  const authValue = { status: 'authenticated' as const, session: { user: { id: context.userId }, accessToken: 'old-token' } };
  const authSpy = vi.spyOn(auth, 'useAuth').mockReturnValue(authValue as ReturnType<typeof auth.useAuth>);
  const businessSpy = vi.spyOn(business, 'useBusinessContext').mockReturnValue({ activeBusinessId: context.businessId, activeRole: 'OWNER', status: 'ready' } as ReturnType<typeof business.useBusinessContext>);
  const boundary = render(<FinanceIntentSessionBoundary />);
  expect(hook.result.current.pendingCommand).toEqual(payload);
  businessSpy.mockReturnValue({ activeBusinessId: '', activeRole: null, status: 'error' } as ReturnType<typeof business.useBusinessContext>);
  boundary.rerender(<FinanceIntentSessionBoundary />);
  authSpy.mockReturnValue({ status: 'unauthenticated', session: null } as ReturnType<typeof auth.useAuth>);
  boundary.rerender(<FinanceIntentSessionBoundary />);
  expect(hook.result.current.pendingCommand).toEqual(payload);
  authSpy.mockReturnValue({ ...authValue, session: { ...authValue.session, accessToken: 'renewed-token' } } as ReturnType<typeof auth.useAuth>);
  businessSpy.mockReturnValue({ activeBusinessId: context.businessId, activeRole: 'OWNER', status: 'ready' } as ReturnType<typeof business.useBusinessContext>);
  boundary.rerender(<FinanceIntentSessionBoundary />);
  expect(hook.result.current.pendingCommand).toEqual(payload);
  businessSpy.mockReturnValue({ activeBusinessId: 'another-business', activeRole: 'OWNER', status: 'ready' } as ReturnType<typeof business.useBusinessContext>);
  boundary.rerender(<FinanceIntentSessionBoundary />);
  expect(hook.result.current.pendingCommand).toBeNull();
  expect(executor).toHaveBeenCalledTimes(1);
});
