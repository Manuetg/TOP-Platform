/// <reference types="node" />
import { webcrypto, createHash } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareEvidenceFile, uploadFinanceEvidence } from './finance-evidence-api';
import { clearFinanceIntentMemory, useFinanceIntent } from './use-finance-intent';
import { v2TestId } from './v2-test.fixture';
import type { FinanceEvidenceUploadResult } from './finance-evidence.types';

const context = { userId: 'integrity-owner', businessId: 'integrity-business', accessToken: 'synthetic-token' };
const bytes = new Uint8Array([1, 2, 3]);
const filename = 'Comprobante ñ.pdf';
const sha256 = createHash('sha256').update(bytes).digest('hex');
const result: FinanceEvidenceUploadResult = { type: 'UPLOAD_FINANCE_EVIDENCE', id: v2TestId, version: 2, file: { id: v2TestId, businessId: context.businessId, expenseId: v2TestId, expenseVersion: 2, filename, mimeType: 'application/pdf', sizeBytes: 3, sha256, recordedByUserId: context.userId, createdAt: '2026-10-05T12:00:00.000Z' } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { cleanup(); clearFinanceIntentMemory(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('prepara SHA256 de bytes originales y sólo acepta metadata y CAS exactos del intento', async () => {
  const command = await prepareEvidenceFile(new File([bytes], filename, { type: 'application/pdf' }), v2TestId, 1);
  expect(command.sha256).toBe(sha256);
  expect(Array.from(atob(command.bytesBase64), (character) => character.charCodeAt(0))).toEqual([1, 2, 3]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(result)));
  await expect(uploadFinanceEvidence(context, command, 'integrity-test-key')).resolves.toEqual(result);
});

it.each([
  ['versión posterior ajena', { ...result, version: 3, file: { ...result.file, expenseVersion: 3 } }],
  ['nombre cambiado', { ...result, file: { ...result.file, filename: 'Otro comprobante.pdf' } }],
  ['SHA256 de otros bytes', { ...result, file: { ...result.file, sha256: 'a'.repeat(64) } }],
  ['MIME cambiado', { ...result, file: { ...result.file, mimeType: 'image/png' } }],
  ['tamaño cambiado', { ...result, file: { ...result.file, sizeBytes: 4 } }],
])('rechaza %s sin cerrar intención; recuperación explícita repite bytes, SHA256, versión y clave', async (_description, invalid) => {
  const command = await prepareEvidenceFile(new File([bytes], filename, { type: 'application/pdf' }), v2TestId, 1);
  const fetch = vi.fn().mockResolvedValueOnce(json(invalid)).mockResolvedValueOnce(json(result));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useFinanceIntent(context, 'integrity', uploadFinanceEvidence), { wrapper });
  await act(async () => { await expect(hook.result.current.execute(command)).rejects.toMatchObject({ name: 'ApiResponseError' }); });
  expect(hook.result.current.hasUncertainResult).toBe(true);
  expect(hook.result.current.pendingCommand).toEqual(command);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => { await expect(hook.result.current.retry()).resolves.toEqual(result); });
  expect(hook.result.current.pendingCommand).toBeNull();
  const requests = fetch.mock.calls;
  expect(new Set(requests.map(([, request]) => new Headers(request.headers).get('Idempotency-Key'))).size).toBe(1);
  expect(requests.every(([, request]) => (request.body as FormData).get('expectedVersion') === '1')).toBe(true);
  client.clear();
});
