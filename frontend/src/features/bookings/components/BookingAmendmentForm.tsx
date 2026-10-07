import { useCallback, useEffect, useRef, useState } from "react";
import { useIsPresent } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { ApiError } from "../../../shared/api/api-client";
import { formatMoney, parseGuaranies } from "../../../shared/utils/money";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { ManualPriceFields } from "../../pricing/components/ManualPriceFields";
import { useSelectableRatePlans } from "../../pricing/queries/use-selectable-rate-plans";
import { BookingDraftForm, type BookingDraftFormInitialValues } from "./BookingDraftForm";
import { useBookingAmendment } from "../queries/use-booking-amendment";
import { getBookingStatusLabel } from "../booking-status";
import type { Booking, CreateBookingInput } from "../types/booking.types";
import type { BookingAmendmentInput, BookingAmendmentPreview } from "../types/booking-amendment.types";
import "./BookingAmendmentForm.css";

export function BookingAmendmentForm({ booking, businessId, notice, onStalePreview }: {
  booking: Booking; businessId: string; notice: string | null; onStalePreview: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { session, status: authStatus } = useAuth();
  const { activeBusiness, activeBusinessId, activeRole, status: businessStatus } = useBusinessContext();
  const initialValues: BookingDraftFormInitialValues = {
    contactId: booking.contactId ?? "", resourceId: booking.resourceIds[0] ?? "",
    checkInDate: booking.checkInDate ?? "", checkOutDate: booking.checkOutDate ?? "",
    adults: booking.adults === null ? "" : String(booking.adults), children: booking.children === null ? "" : String(booking.children), notes: booking.notes ?? "",
  };
  const [values, setValues] = useState(initialValues);
  const [changePrice, setChangePrice] = useState(false);
  const [mode, setMode] = useState<"CONFIGURED" | "MANUAL_NO_RATE_PLAN">("CONFIGURED");
  const [ratePlanId, setRatePlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<{ input: BookingAmendmentInput; fingerprint: string; preview: BookingAmendmentPreview } | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const version = useRef(0);
  const formFingerprint = useRef(JSON.stringify(initialValues));
  const isPresent = useIsPresent();
  const present = useRef(isPresent); present.current = isPresent;
  const currency = booking.financialSummary?.currency ?? activeBusiness?.currency ?? "";
  const canEdit = authStatus === "authenticated" && Boolean(session?.user.id && session.accessToken) && businessStatus === "ready" &&
    activeBusinessId === businessId && activeBusiness?.id === businessId && activeBusiness.status === "ACTIVE" &&
    ["OWNER", "ADMIN", "RECEPTIONIST"].includes(activeRole ?? "") && booking.businessId === businessId &&
    ["PENDING", "CONFIRMED"].includes(booking.status) && booking.financialSummary?.totalAmountMinor != null &&
    Number.isSafeInteger(booking.financialSummary.financialVersion) && booking.financialSummary.financialVersion >= 0;
  const canOverride = activeRole === "OWNER" || activeRole === "ADMIN";
  const datesChanged = values.checkInDate !== booking.checkInDate || values.checkOutDate !== booking.checkOutDate;
  const needsPrice = datesChanged || changePrice;
  const plans = useSelectableRatePlans({ businessId, resourceId: needsPrice && mode === "CONFIGURED" ? values.resourceId : "",
    checkIn: values.checkInDate, checkOut: values.checkOutDate, accessToken: session?.accessToken });
  const mutations = useBookingAmendment({ businessId, bookingId: booking.id, accessToken: session?.accessToken });
  const manualAmount = parseGuaranies(amount, true);
  const reasonValid = !reason.trim() || (reason.trim().length >= 2 && reason.trim().length <= 500);
  const pricingReady = !needsPrice || (mode === "MANUAL_NO_RATE_PLAN" ? canOverride && manualAmount !== null && manualReason.trim().length >= 2 && manualReason.trim().length <= 500 :
    plans.isSuccess && !plans.isFetching && !plans.isError && Boolean(plans.data?.some((plan) => plan.id === ratePlanId)));

  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); }; }, []);
  const discard = useCallback(() => {
    version.current += 1; operation.current?.abort(); lock.current = false;
    setBusy(null); setReview(null); setError(null);
  }, []);
  const onValuesChange = useCallback((next: BookingDraftFormInitialValues) => {
    const fingerprint = JSON.stringify(next);
    if (fingerprint !== formFingerprint.current) { formFingerprint.current = fingerprint; discard(); setValues(next); }
  }, [discard]);
  useEffect(() => { setRatePlanId(""); }, [values.checkInDate, values.checkOutDate]);

  function change(action: () => void) { discard(); action(); }
  function current(controller: AbortController, requestVersion: number) {
    return alive.current && present.current && !controller.signal.aborted && version.current === requestVersion && canEdit;
  }
  async function submit(input: CreateBookingInput) {
    if (!alive.current || !present.current || !canEdit || lock.current || !reasonValid || !pricingReady ||
      input.resourceIds?.length !== 1 || input.resourceIds[0] !== booking.resourceIds[0]) return;
    const changes: BookingAmendmentInput = { contactId: input.contactId!, checkInDate: input.checkInDate!, checkOutDate: input.checkOutDate!,
      adults: input.adults, children: input.children, notes: input.notes,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(needsPrice ? { pricing: [mode === "MANUAL_NO_RATE_PLAN" ? { resourceId: values.resourceId, pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: manualAmount!, overrideReason: manualReason.trim() } : { resourceId: values.resourceId, ratePlanId }] } : {}),
    };
    const fingerprint = JSON.stringify(changes);
    const accepted = review?.fingerprint === fingerprint ? review : null;
    lock.current = true; setError(null); setBusy(accepted ? "save" : "preview");
    const controller = new AbortController(); operation.current = controller;
    const requestVersion = version.current;
    try {
      if (accepted) {
        const preview = accepted.preview;
        await mutations.save({ ...accepted.input, expectedUpdatedAt: preview.expectedUpdatedAt, currentPricingId: preview.currentPricingId,
          expectedPaidAmountMinor: preview.expectedPaidAmountMinor, expectedFinancialVersion: preview.expectedFinancialVersion, acceptedQuote: preview.quote }, controller.signal);
        if (current(controller, requestVersion)) navigate(`/app/bookings/${booking.id}`);
      } else {
        const preview = await mutations.preview(changes, controller.signal);
        if (!current(controller, requestVersion)) return;
        if (preview.bookingId !== booking.id || preview.currentPricing.bookingId !== booking.id || preview.currentPricing.businessId !== businessId ||
          preview.quote.currency !== preview.currentPricing.currency || !["PENDING", "CONFIRMED"].includes(preview.status)) {
          throw new Error("La revisión no corresponde a esta reserva. Volvé a revisar los cambios.");
        }
        if (preview.expectedUpdatedAt !== booking.updatedAt || preview.expectedFinancialVersion !== booking.financialSummary?.financialVersion) {
          setReview(null);
          await onStalePreview();
          return;
        }
        setReview({ input: changes, fingerprint, preview });
      }
    } catch (failure) {
      if (!current(controller, requestVersion)) return;
      setReview(null);
      setError(failure instanceof ApiError && failure.status === 409 ? `${failure.message} Revisá los cambios otra vez antes de guardar.` :
        failure instanceof Error ? failure.message : "No pudimos completar los cambios. Revisá e intentá nuevamente.");
    } finally {
      if (current(controller, requestVersion)) { lock.current = false; setBusy(null); }
    }
  }

  const priceContent = <section className="create-booking-card booking-amendment-price" aria-labelledby="amendment-price-title">
    <h2 id="amendment-price-title">Precio de la estadía</h2>
    <p>Precio acordado: <strong>{formatMoney(booking.financialSummary?.totalAmountMinor ?? 0, currency)}</strong></p>
    {!datesChanged ? <label className="booking-amendment-toggle"><input type="checkbox" checked={changePrice} disabled={Boolean(busy)} onChange={(event) => change(() => setChangePrice(event.target.checked))} />Cambiar tarifa o precio</label> :
      <p className="create-booking-summary__notice">Para cambiar fechas, seleccioná una tarifa o ingresá un precio manual para la nueva estadía.</p>}
    {needsPrice && <>
      <div className="booking-amendment-modes" role="group" aria-label="Modo de precio">
        <Button type="button" variant={mode === "CONFIGURED" ? "primary" : "secondary"} disabled={Boolean(busy)} aria-pressed={mode === "CONFIGURED"} onClick={() => { if (mode !== "CONFIGURED") change(() => setMode("CONFIGURED")); }}>Configurada</Button>
        {canOverride && <Button type="button" variant={mode === "MANUAL_NO_RATE_PLAN" ? "primary" : "secondary"} disabled={Boolean(busy)} aria-pressed={mode === "MANUAL_NO_RATE_PLAN"} onClick={() => { if (mode !== "MANUAL_NO_RATE_PLAN") change(() => setMode("MANUAL_NO_RATE_PLAN")); }}>Manual</Button>}
      </div>
      {mode === "MANUAL_NO_RATE_PLAN" ? <ManualPriceFields amount={amount} reason={manualReason} currency={activeBusiness?.currency ?? currency} disabled={Boolean(busy)} onAmountChange={(value) => { if (value !== amount) change(() => setAmount(value)); }} onReasonChange={(value) => { if (value !== manualReason) change(() => setManualReason(value)); }} /> :
        <div className="create-booking-field"><label htmlFor="amendment-rate">Tarifa para esta estadía</label>
          <select id="amendment-rate" className="top-input" value={ratePlanId} disabled={Boolean(busy) || plans.isFetching} onChange={(event) => change(() => setRatePlanId(event.target.value))}>
            <option value="">Seleccioná una tarifa</option>{plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          {plans.isFetching && <p role="status">Consultando tarifas para las fechas seleccionadas…</p>}
          {plans.isError && <><p role="alert">No pudimos consultar las tarifas.</p><Button type="button" variant="secondary" onClick={() => void plans.refetch()}>Reintentar tarifas</Button></>}
          {plans.isSuccess && !plans.data.length && <p>No hay una tarifa disponible para esta estadía.</p>}
        </div>}
    </>}
    <Input id="amendment-reason" label="Motivo del cambio (opcional)" value={reason} disabled={Boolean(busy)} maxLength={500}
      error={!reasonValid ? "Si indicás un motivo, usá entre 2 y 500 caracteres." : undefined} onChange={(event) => change(() => setReason(event.target.value))} />
  </section>;

  const reviewContent = <div className="booking-amendment-review" aria-live="polite">
    {review ? <><h3>Revisión de cambios</h3><dl>
      <div><dt>Precio anterior</dt><dd>{formatMoney(review.preview.currentPricing.totalAmountMinor, review.preview.currentPricing.currency)}</dd></div>
      <div><dt>Nuevo precio</dt><dd>{formatMoney(review.preview.quote.totalAmountMinor, review.preview.quote.currency)}</dd></div>
      <div><dt>Pagado</dt><dd>{formatMoney(review.preview.financialSummary.paidAmountMinor, review.preview.quote.currency)}</dd></div>
      <div><dt>Saldo pendiente</dt><dd>{formatMoney(review.preview.financialSummary.outstandingAmountMinor, review.preview.quote.currency)}</dd></div>
      {review.preview.financialSummary.creditAmountMinor > 0 && <div><dt>Saldo a favor</dt><dd>{formatMoney(review.preview.financialSummary.creditAmountMinor, review.preview.quote.currency)}</dd></div>}
    </dl>{review.preview.warnings.map((warning) => <p key={warning} className="create-booking-summary__notice">{warning}</p>)}</> :
      <p>Revisá los cambios para conocer el precio, los pagos conservados y el saldo antes de guardar.</p>}
    <p className="create-booking-summary__notice">Los pagos registrados se conservan. Esta edición no genera devoluciones ni modifica automáticamente el plan de pagos.</p>
  </div>;

  return <section className="create-booking-page booking-amendment-page">
    <header className="create-booking-header"><div><span className="create-booking-eyebrow">Reserva · {activeBusiness?.name}</span><h1>Editar reserva</h1><p>Revisá el precio y el saldo antes de guardar los cambios.</p></div>
      <span className="create-booking-draft-badge">{getBookingStatusLabel(booking.status)}</span></header>
    {notice && <p className="create-booking-summary__notice" role="status">{notice}</p>}
    <BookingDraftForm businessId={businessId} initialValues={initialValues} submitLabel={review ? "Guardar cambios" : "Revisar cambios"} pendingLabel={busy === "save" ? "Guardando…" : "Revisando…"}
      isPending={Boolean(busy)} errorMessage={error} onSubmit={submit} onCancel={() => navigate(`/app/bookings/${booking.id}`)}
      amendment={{ onValuesChange, priceContent, reviewContent, submitDisabled: !canEdit || !reasonValid || !pricingReady }} />
  </section>;
}
