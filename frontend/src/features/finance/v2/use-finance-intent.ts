import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, ApiResponseError, ApiTransportError } from '../../../shared/api/api-client';
import { createPaymentIdempotencyKey } from '../../../shared/utils/create-payment-idempotency-key';
import type { FinanceContext } from '../api/finance-api';

// Memoria de sesión: sólo payload, clave e identidad. Nunca persiste el bearer ni dispara un reintento.
interface Intent { command: unknown; fingerprint: string; key: string; uncertain: boolean; inFlight: Promise<unknown> | null }
const intents = new Map<string, Intent>();
const listeners = new Map<string, Set<() => void>>();
function notify(scope: string) { listeners.get(scope)?.forEach((listener) => listener()); }
function save(scope: string, value: Intent | null) { if (value) intents.set(scope, value); else intents.delete(scope); notify(scope); }

export function clearFinanceIntentMemory() {
  for (const scope of intents.keys()) save(scope, null);
}

export function reconcileFinanceIntentAuthority(authority: { userId: string; businessId: string; role: string }) {
  for (const scope of intents.keys()) {
    const [userId, businessId] = JSON.parse(scope) as [string, string, string];
    if (authority.role !== 'OWNER' || userId !== authority.userId || businessId !== authority.businessId) save(scope, null);
  }
}

export function useFinanceIntent<C, R>(context: FinanceContext, channel: string, executor: (context: FinanceContext, command: C, key: string) => Promise<R>) {
  const client = useQueryClient();
  const scope = JSON.stringify([context.userId, context.businessId, channel]);
  const intent = useSyncExternalStore((listener) => {
    const current = listeners.get(scope) ?? new Set<() => void>(); current.add(listener); listeners.set(scope, current);
    return () => { current.delete(listener); if (!current.size) listeners.delete(scope); };
  }, () => intents.get(scope) ?? null, () => null);
  function execute(command: C): Promise<R> {
    const fingerprint = JSON.stringify(command); let current = intents.get(scope);
    if (current?.inFlight) return current.fingerprint === fingerprint ? current.inFlight as Promise<R> : Promise.reject(new Error('Hay un registro en curso. Espera su resultado.'));
    if (current && current.fingerprint !== fingerprint) return Promise.reject(new Error('Primero verifica el registro pendiente con Reintentar el mismo registro.'));
    if (!current) current = { command: JSON.parse(fingerprint) as C, fingerprint, key: createPaymentIdempotencyKey(), uncertain: false, inFlight: null };
    const request = current; const requestContext = { ...context };
    const promise = Promise.resolve().then(() => executor(requestContext, request.command as C, request.key)).then((result) => {
      if (intents.get(scope)?.key === request.key) save(scope, null);
      void client.invalidateQueries({ queryKey: ['finance', requestContext.userId, requestContext.businessId] }).catch(() => undefined);
      return result;
    }, (error: unknown) => {
      if (intents.get(scope)?.key === request.key) {
        const uncertain = request.uncertain || error instanceof ApiTransportError || error instanceof ApiResponseError || (error instanceof ApiError && error.status >= 500);
        save(scope, uncertain ? { ...request, uncertain: true, inFlight: null } : null);
      }
      throw error;
    });
    save(scope, { ...request, inFlight: promise }); return promise;
  }
  function retry() { const current = intents.get(scope); return current ? execute(current.command as C) : Promise.reject(new Error('No hay un registro pendiente.')); }
  return { execute, retry, isPending: Boolean(intent?.inFlight), hasUncertainResult: Boolean(intent?.uncertain), pendingCommand: (intent?.command ?? null) as C | null };
}
