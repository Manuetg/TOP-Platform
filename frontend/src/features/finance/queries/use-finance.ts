import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError, ApiResponseError, ApiTransportError } from "../../../shared/api/api-client";
import { createPaymentIdempotencyKey } from "../../../shared/utils/create-payment-idempotency-key";
import { executeFinanceCommand, getFinanceAudit, getFinanceExpense, getFinanceReport, type FinanceContext } from "../api/finance-api";
import type { FinanceCommand, FinanceQuery, FinanceResult } from "../types/finance.types";

export const financeKey = (context: FinanceContext) => ["finance", context.userId, context.businessId] as const;
export function useFinanceReport(context: FinanceContext, period: FinanceQuery) {
  return useQuery({ queryKey: [...financeKey(context), "report", period], queryFn: ({ signal }) => getFinanceReport(context, period, signal),
    enabled: Boolean(context.businessId && context.userId && context.accessToken), retry: false, placeholderData: undefined });
}
export function useFinanceExpense(context: FinanceContext, id: string) {
  return useQuery({ queryKey: [...financeKey(context), "expense", id], queryFn: ({ signal }) => getFinanceExpense(context, id, signal),
    enabled: Boolean(id && context.businessId && context.userId && context.accessToken), retry: false, placeholderData: undefined });
}
export function useFinanceAudit(context: FinanceContext, sourceType: string, sourceId: string) {
  return useQuery({ queryKey: [...financeKey(context), "audit", sourceType, sourceId], queryFn: ({ signal }) => getFinanceAudit(context, sourceType, sourceId, signal),
    enabled: Boolean(sourceId && context.businessId && context.userId && context.accessToken), retry: false, placeholderData: undefined });
}
type Intent = { context: FinanceContext; command: FinanceCommand; fingerprint: string; key: string; uncertain: boolean };
function uncertain(error: unknown) {
  return error instanceof ApiTransportError || error instanceof ApiResponseError || (error instanceof ApiError && error.status >= 500);
}
/** The captured command and key survive an uncertain result; changing its payload requires resolving it first. */
export function useFinanceCommand(context: FinanceContext) {
  const client = useQueryClient();
  const intent = useRef<Intent | null>(null);
  const inFlight = useRef<Promise<FinanceResult> | null>(null);
  const runningKey = useRef<string | null>(null);
  const scope = JSON.stringify([context.userId, context.businessId]);
  const [hasUncertainResult, setUncertain] = useState(false);
  const mutation = useMutation({ retry: false, mutationFn: (request: Intent) => executeFinanceCommand(request.context, request.command, request.key) });
  useEffect(() => { intent.current = null; inFlight.current = null; runningKey.current = null; setUncertain(false); }, [scope]);
  async function run(request: Intent): Promise<FinanceResult> {
    try {
      const result = await mutation.mutateAsync(request);
      if (intent.current?.key === request.key) { intent.current = null; setUncertain(false); }
      await client.invalidateQueries({ queryKey: financeKey(request.context) });
      return result;
    } catch (error) {
      if (intent.current?.key === request.key) {
        if (uncertain(error) || request.uncertain) { intent.current.uncertain = true; setUncertain(true); }
        else { intent.current = null; setUncertain(false); }
      }
      throw error;
    } finally { if (runningKey.current === request.key) { inFlight.current = null; runningKey.current = null; } }
  }
  function execute(command: FinanceCommand) {
    const fingerprint = JSON.stringify(command);
    if (inFlight.current) {
      if (intent.current?.fingerprint !== fingerprint) return Promise.reject(new Error("Hay un registro en curso. Espera su resultado antes de enviar otro contenido."));
      return inFlight.current;
    }
    if (intent.current && intent.current.fingerprint !== fingerprint) {
      return Promise.reject(new Error("Primero verifica el registro pendiente con Reintentar el mismo registro."));
    }
    if (!intent.current) intent.current = { context: { ...context }, command: JSON.parse(fingerprint) as FinanceCommand, fingerprint, key: createPaymentIdempotencyKey(), uncertain: false };
    if (intent.current.context.userId !== context.userId || intent.current.context.businessId !== context.businessId) return Promise.reject(new Error("El registro pendiente pertenece a otro contexto. Revisa el negocio activo."));
    // La sesión puede renovarse para la misma identidad; la intención económica y su clave se conservan.
    intent.current = { ...intent.current, context: { ...context } };
    runningKey.current = intent.current.key;
    inFlight.current = run(intent.current);
    return inFlight.current;
  }
  function retry() {
    if (!intent.current) return Promise.reject(new Error("No hay un registro pendiente."));
    return execute(intent.current.command);
  }
  return { execute, retry, isPending: mutation.isPending, error: mutation.error, hasUncertainResult, reset: mutation.reset };
}
export type FinanceCommandMutation = ReturnType<typeof useFinanceCommand>;
