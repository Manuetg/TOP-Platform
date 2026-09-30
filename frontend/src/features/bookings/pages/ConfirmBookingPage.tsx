import { ManualPriceFields } from "../../pricing/components/ManualPriceFields";
import { formatPureDate as formatDate } from "../../../shared/utils/date-format";
import { formatMoney, parseGuaranies } from "../../../shared/utils/money";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Home,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useResources } from "../../resources/queries/use-resources";
import { useCalculatePrice } from "../../pricing/queries/use-calculate-price";
import { useSelectableRatePlans } from "../../pricing/queries/use-selectable-rate-plans";
import { useBooking } from "../queries/use-booking";
import { useConfirmBooking } from "../queries/use-confirm-booking";
import type { CalculatePriceResult } from "../../pricing/types/pricing.types";
import "./ConfirmBookingPage.css";





export function ConfirmBookingPage() {
  const { activeBusinessId } = useBusinessContext(); const { session } = useAuth(); const { bookingId } = useParams();
  return <ConfirmBookingContent key={`${session?.user.id}:${activeBusinessId}:${bookingId}`} />;
}

function ConfirmBookingContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const confirmationError = typeof location.state?.confirmationError === "string" ? location.state.confirmationError : null;
  const { bookingId = "" } = useParams();
  const { session } = useAuth();

  const { activeBusinessId: businessId, activeBusiness, activeRole } = useBusinessContext();
  const currency = activeBusiness?.currency ?? "";

  const {
    data: booking,
    isLoading: isLoadingBooking,
    isFetching: isFetchingBooking,
    isError: isBookingError,
    error: bookingError,
  } = useBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const {
    data: resources,
    isLoading: isLoadingResources,
    isFetching: isFetchingResources,
    isError: isResourcesError,
    error: resourcesError,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const resourceId =
    booking?.resourceIds[0] ?? "";

  const checkIn =
    booking?.checkInDate ?? "";

  const checkOut =
    booking?.checkOutDate ?? "";

  const resource = useMemo(
    () =>
      (resources ?? []).find(
        (item) =>
          item.id === resourceId,
      ),
    [resources, resourceId],
  );

  const {
    data: ratePlans,
    isLoading: isLoadingRatePlans,
    isFetching: isFetchingRatePlans,
    refetch: retryRatePlans,
    isSuccess: ratePlansReady,
    isError: isRatePlansError,
    error: ratePlansError,
  } = useSelectableRatePlans({
    businessId,
    resourceId,
    checkIn,
    checkOut,
    accessToken: session?.accessToken,
  });

  const [ratePlanId, setRatePlanId] =
    useState("");

  const [preview, setPreview] =
    useState<CalculatePriceResult | null>(
      null,
    );

  const [pricingMode, setPricingMode] = useState<"CONFIGURED" | "MANUAL_NO_RATE_PLAN">("CONFIGURED");
  const canOverride = activeRole === "OWNER" || activeRole === "ADMIN";
  const contextRefetching = Boolean(isFetchingBooking || isFetchingResources);
  const manualContextKey = JSON.stringify([session?.user.id, businessId, bookingId, booking?.contactId, resourceId, checkIn, checkOut, currency, activeRole, activeBusiness?.status, resource?.status]);
  const [manualDraft, setManualDraft] = useState({ contextKey: manualContextKey, amount: "", reason: "" });
  const manualAmount = manualDraft.contextKey === manualContextKey ? manualDraft.amount : "";
  const manualReason = manualDraft.contextKey === manualContextKey ? manualDraft.reason : "";
  const setManualAmount = (amount: string) => setManualDraft((current) => ({ contextKey: manualContextKey, amount, reason: current.contextKey === manualContextKey ? current.reason : "" }));
  const setManualReason = (reason: string) => setManualDraft((current) => ({ contextKey: manualContextKey, amount: current.contextKey === manualContextKey ? current.amount : "", reason }));
  const ratePlansCurrent = ratePlansReady && !isFetchingRatePlans && !isRatePlansError;
  const amountMinor = parseGuaranies(manualAmount, true);
  const manualContextReady = Boolean(businessId && activeBusiness?.status === "ACTIVE" && currency && booking?.businessId === businessId && booking.status === "PENDING" && resource?.businessId === businessId && resource.status === "ACTIVE" && booking.resourceIds.length === 1 && checkIn && checkOut);
  const manualReady = pricingMode === "MANUAL_NO_RATE_PLAN" && canOverride && manualContextReady && !contextRefetching && amountMinor !== null && manualReason.trim().length >= 2 && manualReason.trim().length <= 500;

  const [pageError, setPageError] =
    useState<string | null>(null);

  const calculateMutation =
    useCalculatePrice({
      businessId,
      ratePlanId,
      accessToken: session?.accessToken,
    });

  const confirmMutation =
    useConfirmBooking({
      businessId,
      bookingId,
      accessToken: session?.accessToken,
    });

  const selectedRatePlan = useMemo(
    () =>
      (ratePlans ?? []).find(
        (plan) =>
          plan.id === ratePlanId,
      ),
    [ratePlans, ratePlanId],
  );

  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    setPreview(null); setPageError(null);
    return () => { operation.current?.abort(); operation.current = null; };
  }, [manualContextKey, ratePlanId]);
  useEffect(() => {
    if (!ratePlansReady) return;
    if (pricingMode === "CONFIGURED" && !(ratePlans ?? []).some((plan) => plan.id === ratePlanId)) setRatePlanId(ratePlans?.length === 1 ? ratePlans[0].id : "");
  }, [ratePlans, ratePlansReady, ratePlanId, pricingMode]);

  useEffect(() => {
    setManualDraft({ contextKey: manualContextKey, amount: "", reason: "" });
    setPricingMode("CONFIGURED");
  }, [manualContextKey]);

  function changePricingMode(mode: "CONFIGURED" | "MANUAL_NO_RATE_PLAN") {
    if (mode === pricingMode || confirmMutation.isPending) return;
    operation.current?.abort(); operation.current = null;
    setPricingMode(mode);
    setRatePlanId("");
    setPreview(null);
    setPageError(null);
  }

  async function handlePreview() {
    setPageError(null);
    setPreview(null);

    if (operation.current || contextRefetching || pricingMode !== "CONFIGURED" || !selectedRatePlan || !ratePlansCurrent) {
      setPageError(
        "Seleccioná un plan tarifario.",
      );
      return;
    }

    const controller = new AbortController(); operation.current = controller;
    try {
      const result =
        await calculateMutation.mutateAsync({
          resourceId,
          checkIn,
          checkOut,
          signal: controller.signal,
        });

      if (controller.signal.aborted) return;
      setPreview(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPageError(
        error instanceof Error
          ? error.message
          : "No pudimos calcular el precio.",
      );
    } finally { if (operation.current === controller) operation.current = null; }
  }

  async function handleConfirm() {
    if (operation.current) return;
    setPageError(null);

    if (contextRefetching || (pricingMode === "MANUAL_NO_RATE_PLAN" ? !manualReady : !ratePlansCurrent || !selectedRatePlan || !preview)) {
      setPageError(
        "Calculá el precio antes de confirmar.",
      );
      return;
    }

    const controller = new AbortController(); operation.current = controller;
    try {
      await confirmMutation.mutateAsync({
        signal: controller.signal,
        pricing: [
          {
            resourceId,
            ...(pricingMode === "MANUAL_NO_RATE_PLAN" ? { pricingMode: "MANUAL_NO_RATE_PLAN" as const, agreedAmountMinor: amountMinor!, overrideReason: manualReason.trim() } : { ratePlanId }),
          },
        ],
      });

      if (controller.signal.aborted) return;
      navigate(
        `/app/bookings/${bookingId}`,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setPageError(
        error instanceof Error
          ? error.message
          : "No pudimos confirmar la reserva.",
      );
    } finally { if (operation.current === controller) operation.current = null; }
  }

  const loading = isLoadingBooking || isLoadingResources;

  if (loading) {
    return (
      <section className="confirm-booking-page">
        <div className="confirm-booking-state">
          Cargando confirmación...
        </div>
      </section>
    );
  }

  if (isBookingError || isResourcesError || !booking) {
    return (
      <section className="confirm-booking-page">
        <div
          className="confirm-booking-error"
          role="alert"
        >
          {bookingError instanceof Error
            ? bookingError.message
            : resourcesError instanceof Error
              ? resourcesError.message
            : "No pudimos cargar la reserva."}
        </div>
      </section>
    );
  }

  if (booking.status !== "PENDING") {
    return (
      <section className="confirm-booking-page">
        <div
          className="confirm-booking-error"
          role="alert"
        >
          Solo las reservas pendientes pueden confirmarse.
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            navigate(
              `/app/bookings/${booking.id}`,
            )
          }
        >
          Volver a la reserva
        </Button>
      </section>
    );
  }

  if (
    booking.resourceIds.length !== 1 ||
    !booking.checkInDate ||
    !booking.checkOutDate
  ) {
    return (
      <section className="confirm-booking-page">
        <div
          className="confirm-booking-error"
          role="alert"
        >
          La reserva no tiene alojamiento y fechas completas para poder confirmarse.
        </div>
      </section>
    );
  }

  return (
    <section className="confirm-booking-page">
      <button
        type="button"
        className="confirm-booking-back"
        onClick={() =>
          navigate(
            `/app/bookings/${booking.id}`,
          )
        }
      >
        <ArrowLeft
          size={17}
          aria-hidden="true"
        />
        Volver a la reserva
      </button>

      <header className="confirm-booking-header">
        <span>Reserva pendiente</span>
        <h1>Confirmar reserva</h1>
        <p>
          Elige cómo fijar el precio y revisa el total antes de confirmar.
        </p>
      </header>

      {confirmationError && <p role="alert">La reserva quedó pendiente. {confirmationError}</p>}

      <div className="confirm-booking-summary">
        <div>
          <Home
            size={17}
            aria-hidden="true"
          />

          <span>Alojamiento</span>

          <strong>
            {resource?.name ??
              "Alojamiento no disponible"}
          </strong>
        </div>

        <div>
          <CalendarDays
            size={17}
            aria-hidden="true"
          />

          <span>Estadía</span>

          <strong>
            {formatDate(
              booking.checkInDate,
            )}
            {" → "}
            {formatDate(
              booking.checkOutDate,
            )}
          </strong>
        </div>
      </div>

      <section className="confirm-booking-card">
        <div className="confirm-booking-card__heading">
          <h2>Precio de la estadía</h2>
          <p>Elige una tarifa configurada o ingresa un precio manual.</p>
        </div>

        <div className="confirm-booking-modes" role="group" aria-label="Modo de precio">
          <Button type="button" variant="secondary" aria-pressed={pricingMode === "CONFIGURED"} disabled={confirmMutation.isPending} onClick={() => changePricingMode("CONFIGURED")}>Configurada</Button>
          {canOverride && <Button type="button" variant="secondary" aria-pressed={pricingMode === "MANUAL_NO_RATE_PLAN"} disabled={confirmMutation.isPending} onClick={() => changePricingMode("MANUAL_NO_RATE_PLAN")}>Manual</Button>}
        </div>

        {pricingMode === "MANUAL_NO_RATE_PLAN" ? <>
          {contextRefetching ? <p role="status">Verificando la reserva y el alojamiento...</p> : !manualContextReady && <p role="alert">No se pudo validar el negocio y alojamiento de esta reserva.</p>}
          <ManualPriceFields amount={manualAmount} reason={manualReason} currency={currency} onAmountChange={setManualAmount} onReasonChange={setManualReason} disabled={confirmMutation.isPending || !manualContextReady} />
        </> : <>
        {isLoadingRatePlans ? <p role="status">Buscando planes tarifarios...</p> : isFetchingRatePlans && <p role="status">Actualizando tarifarios...</p>}
        {isRatePlansError && (
          <div
            className="confirm-booking-error"
            role="alert"
          >
            {ratePlansError instanceof Error
              ? ratePlansError.message
              : "No pudimos cargar los planes tarifarios."}
          </div>
        )}
        {!isLoadingRatePlans && ratePlans?.length === 0 ? (
          <div className="confirm-booking-empty">
            <p>No hay un tarifario disponible para esta estadía.</p>
            <p>{canOverride ? "Puedes elegir Precio manual o configurar una tarifa." : "Solicita al propietario o administrador que defina un precio o configure una tarifa."}</p>
          </div>
        ) : !isLoadingRatePlans && ratePlans?.length ? (
          <label className="confirm-booking-field">
            <span>
              Plan tarifario
            </span>

            <select className="top-input" disabled={calculateMutation.isPending || confirmMutation.isPending}
              value={ratePlanId}
              onChange={(event) => {
                setRatePlanId(
                  event.target.value,
                );
                setPreview(null);
                setPageError(null);
              }}
            >
              <option value="">
                Seleccionar
              </option>

              {ratePlans.map(
                (plan) => (
                  <option
                    key={plan.id}
                    value={plan.id}
                  >
                    {plan.name}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        {(isRatePlansError || ratePlans?.length === 0) && (
          <Button type="button" variant="secondary" disabled={confirmMutation.isPending} onClick={() => void retryRatePlans()}>
            {isRatePlansError ? "Reintentar tarifarios" : "Volver a consultar"}
          </Button>
        )}

        {selectedRatePlan && (
          <div className="confirm-booking-plan-info">
            <span>Tarifa base</span>
            <strong>
              {formatMoney(
                selectedRatePlan.baseNightlyAmountMinor,
                selectedRatePlan.currency,
              )}
            </strong>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          disabled={
            contextRefetching || !selectedRatePlan || !ratePlansCurrent ||
            calculateMutation.isPending
          }
          onClick={() =>
            void handlePreview()
          }
        >
          {calculateMutation.isPending
            ? "Calculando..."
            : "Calcular precio"}
        </Button>
        </>}
      </section>

      {manualReady && <section className="confirm-booking-price"><div><span>Total manual acordado</span><strong>{formatMoney(amountMinor!, currency)}</strong><p>{manualReason.trim()}</p></div></section>}

      {pricingMode === "CONFIGURED" && preview && (
        <section className="confirm-booking-price">
          <div className="confirm-booking-price__icon">
            <BadgeCheck
              size={22}
              aria-hidden="true"
            />
          </div>

          <div>
            <span>
              Total calculado
            </span>

            <strong>
              {formatMoney(
                preview.totalAmountMinor,
                preview.currency,
              )}
            </strong>

            <p>
              {preview.nights}{" "}
              {preview.nights === 1
                ? "noche"
                : "noches"}
            </p>
          </div>
        </section>
      )}

      {pageError && (
        <div
          className="confirm-booking-error"
          role="alert"
        >
          {pageError}
        </div>
      )}

      <div className="confirm-booking-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={
            confirmMutation.isPending
          }
          onClick={() =>
            navigate(
              `/app/bookings/${booking.id}`,
            )
          }
        >
          Cancelar
        </Button>

        <Button
          type="button"
          disabled={contextRefetching || (pricingMode === "MANUAL_NO_RATE_PLAN" ? !manualReady : !preview || !selectedRatePlan || !ratePlansCurrent) || confirmMutation.isPending}
          onClick={() =>
            void handleConfirm()
          }
        >
          {confirmMutation.isPending
            ? "Confirmando..."
            : "Confirmar reserva"}
        </Button>
      </div>
    </section>
  );
}
