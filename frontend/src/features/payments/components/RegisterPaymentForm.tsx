import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError, ApiResponseError, ApiTransportError } from "../../../shared/api/api-client";
import { registerPayment } from "../api/register-payment";
import { clearPaymentAttempt, readPaymentAttempt, writePaymentAttempt, type PaymentAttempt } from "../storage/payment-attempt-storage";
import type { PaymentMethod, RegisterPaymentPayload } from "../types/payment.types";

const methods = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
const schema = z.object({ amountMinor: z.coerce.number().int("El monto debe ser un entero.").positive("El monto debe ser mayor que cero.").refine(Number.isSafeInteger, "El monto es demasiado grande."), method: z.enum(methods), paidAt: z.string().min(1, "Indicá la fecha y hora."), reference: z.string().max(120, "Máximo 120 caracteres."), note: z.string().max(500, "Máximo 500 caracteres.") });
type Values = z.input<typeof schema>;
interface Props { userId?: string; businessId: string; bookingId: string; accessToken?: string | null; timezone: string; enabled: boolean; canRecord: boolean; bookingStatus?: string; currency?: string; }
function normalized(values: z.output<typeof schema>): RegisterPaymentPayload {
  const date = new Date(values.paidAt);
  if (Number.isNaN(date.valueOf()) || date > new Date()) throw new Error("La fecha y hora no puede estar en el futuro.");
  const reference = values.reference.trim(); const note = values.note.trim();
  return { amountMinor: values.amountMinor, method: values.method as PaymentMethod, paidAt: date.toISOString(), ...(reference ? { reference } : {}), ...(note ? { note } : {}) };
}
function newKey() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function isUncertain(error: unknown) { return error instanceof ApiTransportError || error instanceof ApiResponseError || error instanceof ApiError && error.status >= 500; }

export function RegisterPaymentForm(props: Props) {
  const queryClient = useQueryClient(); const sending = useRef(false); const context = useRef(`${props.userId}:${props.businessId}:${props.bookingId}`); const [attempt, setAttempt] = useState<PaymentAttempt | null>(null); const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { amountMinor: "" as unknown as number, method: "CASH", paidAt: "", reference: "", note: "" } });
  useEffect(() => { context.current = `${props.userId}:${props.businessId}:${props.bookingId}`; if (props.userId) { const stored = readPaymentAttempt(props.userId, props.businessId, props.bookingId); setAttempt(stored); if (stored) form.reset({ ...stored.payload, paidAt: stored.payload.paidAt.slice(0, 16), reference: stored.payload.reference ?? "", note: stored.payload.note ?? "" }); } }, [props.userId, props.businessId, props.bookingId, form]);
  const mutation = useMutation({ mutationFn: (next: PaymentAttempt) => registerPayment({ ...next, accessToken: props.accessToken }), retry: false });
  const eligible = props.enabled && Boolean(props.userId && props.accessToken && props.canRecord && props.currency && ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(props.bookingStatus ?? ""));
  async function send(next: PaymentAttempt) {
    if (sending.current) return; sending.current = true; setMessage(null);
    try { await mutation.mutateAsync(next); if (context.current !== `${next.userId}:${next.businessId}:${next.bookingId}`) return; clearPaymentAttempt(next.userId, next.businessId, next.bookingId); setAttempt(null); form.reset(); setMessage("Pago registrado."); void queryClient.invalidateQueries({ queryKey: ["outstanding-balance", next.userId, next.businessId, next.bookingId] }); void queryClient.invalidateQueries({ queryKey: ["payment-history", next.userId, next.businessId, next.bookingId] }); void queryClient.invalidateQueries({ queryKey: ["payment-plan", next.userId, next.businessId, next.bookingId] }); void queryClient.invalidateQueries({ queryKey: ["dashboard", next.userId, next.businessId] }); }
    catch (error) { if (context.current !== `${next.userId}:${next.businessId}:${next.bookingId}`) return; setAttempt(next); setMessage(isUncertain(error) ? "No pudimos confirmar el registro. Verificá el pago antes de recuperarlo." : error instanceof Error ? error.message : "No pudimos registrar el pago."); }
    finally { sending.current = false; }
  }
  async function submit(values: Values) { if (!props.userId || !eligible || sending.current) return; let payload: RegisterPaymentPayload; try { payload = normalized(schema.parse(values)); } catch (error) { form.setError("paidAt", { message: error instanceof Error ? error.message : "Fecha inválida." }); return; } const next = attempt ?? { version: 1 as const, idempotencyKey: newKey(), userId: props.userId, businessId: props.businessId, bookingId: props.bookingId, payload }; if (!attempt && !writePaymentAttempt(next)) { setMessage("No pudimos preparar un registro recuperable. No se envió el pago."); return; } await send(next); }
  if (!eligible) return <p className="booking-payments__unavailable" role="status">El registro de pagos no está disponible para esta reserva o tu perfil.</p>;
  return <section className="booking-payments__register" aria-labelledby="payment-register-title"><h3 id="payment-register-title">Registrar pago</h3><p>Moneda contractual: <strong>{props.currency}</strong>. La hora se envía como un instante ISO; verificá la zona horaria del negocio: {props.timezone}.</p><form onSubmit={form.handleSubmit(submit)} noValidate><label>Monto (unidades menores)<input aria-invalid={!!form.formState.errors.amountMinor} inputMode="numeric" {...form.register("amountMinor")} /></label>{form.formState.errors.amountMinor && <p role="alert">{form.formState.errors.amountMinor.message}</p>}<label>Método<select {...form.register("method")}>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label>Fecha y hora<input type="datetime-local" {...form.register("paidAt")} /></label>{form.formState.errors.paidAt && <p role="alert">{form.formState.errors.paidAt.message}</p>}<label>Referencia<input {...form.register("reference")} /></label><label>Nota<textarea {...form.register("note")} /></label><button type="submit" className="top-button" disabled={mutation.isPending}>{mutation.isPending ? "Registrando..." : attempt ? "Recuperar el mismo intento" : "Registrar pago"}</button></form>{message && <p role={message === "Pago registrado." ? "status" : "alert"} aria-live="polite">{message}</p>}<p className="booking-payments__attempt-note">Cerrar sesión o la pestaña puede impedir recuperar este intento. Verificá el pago antes de registrarlo nuevamente.</p></section>;
}
