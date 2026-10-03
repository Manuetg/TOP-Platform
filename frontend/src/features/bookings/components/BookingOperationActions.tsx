import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import { Input } from "../../../shared/ui/Input";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useOutstandingBalance } from "../../payments/queries/use-outstanding-balance";
import { useBookingOperation } from "../queries/use-booking-operation";
import type { Booking, BookingOperation } from "../types/booking.types";
import "./BookingOperationActions.css";

interface Props { businessId: string; booking: Booking; disabled?: boolean }
interface ScopeProps extends Props { userId: string; accessToken: string }
const labels: Record<BookingOperation, string> = {
  "check-in": "Registrar ingreso",
  "check-out": "Registrar salida",
  "no-show": "No show",
  "confirm-without-payment": "Confirmar sin cobro",
};
const descriptions: Record<BookingOperation, string> = {
  "check-in": "La reserva pasará a En curso. Registra esta acción cuando el huésped ingrese.",
  "check-out": "La reserva pasará a Finalizada. Registra esta acción cuando el huésped salga.",
  "no-show": "La reserva quedará como No show. Confirma que el huésped no se presentó.",
  "confirm-without-payment": "El total de esta reserva es cero. Se confirmará sin registrar un pago.",
};

function allowed(booking: Booking, operation: BookingOperation, free: boolean) {
  if (operation === "check-in" || operation === "no-show") return booking.status === "CONFIRMED";
  if (operation === "check-out") return booking.status === "IN_PROGRESS";
  return booking.status === "PENDING" && free;
}

/** A scope change unmounts the dialog and aborts its request, including role changes. */
export function BookingOperationActions(props: Props) {
  const { status, session } = useAuth();
  const context = useBusinessContext();
  const permitted = status === "authenticated" && Boolean(session?.user.id && session.accessToken) &&
    context.status === "ready" && context.activeBusinessId === props.businessId &&
    context.activeBusiness?.id === props.businessId && context.activeBusiness.status === "ACTIVE" &&
    props.booking.businessId === props.businessId &&
    (context.activeRole === "OWNER" || context.activeRole === "ADMIN" || context.activeRole === "RECEPTIONIST");
  if (!permitted || !session) return null;
  return <ScopedActions key={`${session.user.id}:${props.businessId}:${props.booking.id}:${context.activeRole}`} {...props} userId={session.user.id} accessToken={session.accessToken} />;
}

function ScopedActions({ booking, businessId, userId, accessToken, disabled = false }: ScopeProps) {
  const [selection, setSelection] = useState<{ operation: BookingOperation; version: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  const live = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const reasonId = useId();
  const operation = useBookingOperation({ businessId, bookingId: booking.id, userId, accessToken });
  const balance = useOutstandingBalance({ businessId, bookingId: booking.id, userId, accessToken, enabled: booking.status === "PENDING" });
  const free = !balance.isError && !balance.isFetching && balance.data?.totalAmountMinor === 0;
  const busy = operation.isPending || reloading;
  const changed = Boolean(selection && selection.version !== booking.updatedAt);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; controller.current?.abort(); };
  }, []);

  useEffect(() => { if (notice) statusMessage.current?.focus(); }, [notice]);

  function open(action: BookingOperation, button: HTMLButtonElement) {
    if (disabled || inFlight.current || !allowed(booking, action, free)) return;
    trigger.current = button;
    setSelection({ operation: action, version: booking.updatedAt });
    setReason(""); setError(null); setValidation(undefined); setNotice(null); setConflict(false);
  }

  function close() {
    if (inFlight.current) return;
    setSelection(null); setReason(""); setError(null); setValidation(undefined); setConflict(false);
  }

  async function reload(scope: { signal: AbortSignal; isCurrent: () => boolean }) {
    setReloading(true);
    try {
      await operation.reload(scope);
      if (!scope.isCurrent() || scope.signal.aborted) return;
      setSelection(null);
      setNotice("Actualizamos la reserva. Revisa el estado y vuelve a elegir la acción.");
    } catch {
      if (scope.isCurrent() && !scope.signal.aborted) setError("No pudimos actualizar la reserva. Recarga el detalle antes de confirmar.");
    } finally {
      if (scope.isCurrent() && !scope.signal.aborted) setReloading(false);
    }
  }

  async function confirm() {
    if (!selection || disabled || inFlight.current || conflict || changed || !allowed(booking, selection.operation, free)) return;
    const trimmed = reason.trim();
    if (trimmed && (trimmed.length < 2 || trimmed.length > 500)) {
      setValidation("El motivo debe tener entre 2 y 500 caracteres."); return;
    }
    const request = new AbortController();
    controller.current = request;
    const scope = { signal: request.signal, isCurrent: () => live.current };
    inFlight.current = true; setError(null); setValidation(undefined);
    try {
      await operation.mutateAsync({ ...scope, operation: selection.operation, expectedUpdatedAt: selection.version, ...(trimmed ? { reason: trimmed } : {}) });
      if (!live.current || request.signal.aborted) return;
      setSelection(null); setReason("");
      setNotice(selection.operation === "confirm-without-payment" ? "Reserva confirmada sin cobro." : "Acción registrada. El estado de la reserva se actualizó.");
    } catch (failure) {
      if (!live.current || request.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 409) {
        setConflict(true);
        await reload(scope);
      } else setError(failure instanceof Error ? failure.message : "No pudimos registrar la acción. Intenta nuevamente.");
    } finally {
      if (live.current && !request.signal.aborted) inFlight.current = false;
    }
  }

  async function retryReload() {
    if (inFlight.current) return;
    const request = new AbortController(); controller.current = request; inFlight.current = true;
    try { await reload({ signal: request.signal, isCurrent: () => live.current }); }
    finally { if (live.current && !request.signal.aborted) inFlight.current = false; }
  }

  return <div className="booking-operations">
    <div className="booking-operations__actions">
      {(["check-in", "check-out", "no-show", "confirm-without-payment"] as const).filter((action) => allowed(booking, action, free)).map((action) => <Button key={action} type="button" variant={action === "no-show" ? "warning" : "primary"} disabled={disabled || busy} onClick={(event) => open(action, event.currentTarget)}>{labels[action]}</Button>)}
    </div>
    {booking.status === "PENDING" && balance.isLoading && <p role="status">Consultando el total de la reserva...</p>}
    {booking.status === "PENDING" && balance.isError && !(balance.error instanceof ApiError && balance.error.status === 409) && <div role="alert"><p>No pudimos consultar el total para confirmar sin cobro.</p><Button type="button" variant="secondary" disabled={balance.isFetching} onClick={() => void balance.refetch()}>Reintentar total</Button></div>}
    {notice && <p role="status" ref={statusMessage} tabIndex={-1}>{notice}</p>}
    <ConfirmDialog open={Boolean(selection)} title={selection ? labels[selection.operation] : "Acción de reserva"} confirmLabel={selection ? labels[selection.operation] : "Confirmar"} confirmVariant={selection?.operation === "no-show" ? "warning" : "primary"} triggerRef={trigger} loading={busy} disabled={disabled || conflict || changed || Boolean(selection && !allowed(booking, selection.operation, free))} error={changed ? "La reserva cambió mientras revisabas esta acción. Cierra el diálogo y revisa el detalle." : error} onConfirm={() => void confirm()} onCancel={close} description={<>
      {selection && <p>{descriptions[selection.operation]}</p>}
      <Input id={reasonId} label="Motivo (opcional)" value={reason} maxLength={500} disabled={busy} error={validation} onChange={(event) => { setReason(event.target.value); setValidation(undefined); }} />
      {conflict && !busy && <Button type="button" variant="secondary" onClick={() => void retryReload()}>Recargar reserva</Button>}
    </>} />
  </div>;
}
