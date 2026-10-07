import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, ApiTransportError } from '../../../shared/api/api-client';
import { useFinanceIntent } from './use-finance-intent';
import type { FinanceContext } from '../api/finance-api';

afterEach(cleanup);
it('una intención incierta sobrevive desmontaje y401/403, no aparece a otra identidad y usa bearer vigente en recuperación explícita', async () => {
  const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const facts = new Map<string, string>(); let attempt = 0;
  const execute = vi.fn(async (context: FinanceContext, command: { type: string; amountMinor: number }, key: string) => {
    attempt++; if (attempt === 1) { facts.set(key, JSON.stringify(command)); throw new ApiTransportError(); }
    if (attempt === 2) throw new ApiError(401, 'Sesión vencida'); if (attempt === 3) throw new ApiError(403, 'Permiso temporalmente retirado');
    expect(JSON.stringify(command)).toBe(facts.get(key)); expect(context.accessToken).toBe('renewed-token'); return { id: 'confirmed' };
  });
  const context = { businessId: 'memory-synthetic', userId: 'memory-owner', accessToken: 'old-token' };
  const first = renderHook(() => useFinanceIntent(context, 'test-economic-intent', execute), { wrapper });
  await act(async () => { await expect(first.result.current.execute({ type: 'REFUND', amountMinor: 200000 })).rejects.toBeInstanceOf(ApiTransportError); });
  await waitFor(() => expect(first.result.current.hasUncertainResult).toBe(true)); first.unmount();
  const stranger = renderHook(() => useFinanceIntent({ ...context, userId: 'other-owner' }, 'test-economic-intent', execute), { wrapper });
  expect(stranger.result.current.pendingCommand).toBeNull(); await expect(stranger.result.current.retry()).rejects.toThrow('No hay un registro pendiente'); expect(attempt).toBe(1); stranger.unmount();
  const restored = renderHook(({ token }) => useFinanceIntent({ ...context, accessToken: token }, 'test-economic-intent', execute), { wrapper, initialProps: { token: 'old-token' } });
  expect(restored.result.current.pendingCommand).toEqual({ type: 'REFUND', amountMinor: 200000 });
  await act(async () => { await expect(restored.result.current.retry()).rejects.toMatchObject({ status: 401 }); }); expect(restored.result.current.hasUncertainResult).toBe(true);
  await act(async () => { await expect(restored.result.current.retry()).rejects.toMatchObject({ status: 403 }); }); expect(restored.result.current.hasUncertainResult).toBe(true);
  restored.rerender({ token: 'renewed-token' }); expect(attempt).toBe(3);
  await act(async () => { await expect(restored.result.current.execute({ type: 'REFUND', amountMinor: 300000 })).rejects.toThrow('Primero verifica'); }); expect(attempt).toBe(3);
  await act(async () => { await expect(restored.result.current.retry()).resolves.toEqual({ id: 'confirmed' }); }); expect(facts.size).toBe(1); expect(new Set(execute.mock.calls.map((call) => call[2])).size).toBe(1); expect(restored.result.current.pendingCommand).toBeNull(); client.clear();
});
