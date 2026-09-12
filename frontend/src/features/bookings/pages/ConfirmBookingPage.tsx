import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Home,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../../resources/queries/use-resources";
import { useCalculatePrice } from "../../pricing/queries/use-calculate-price";
import { useSelectableRatePlans } from "../../pricing/queries/use-selectable-rate-plans";
import { useBooking } from "../queries/use-booking";
import { useConfirmBooking } from "../queries/use-confirm-booking";
import type { CalculatePriceResult } from "../../pricing/types/pricing.types";
import "./ConfirmBookingPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function formatMoney(
  amountMinor: number,
  currency: string,
) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatDate(value: string) {
  const [year, month, day] = value
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(
    new Date(year, month - 1, day),
  );
}

export function ConfirmBookingPage() {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams();
  const { session } = useAuth();

  const businessId = TEMP_BUSINESS_ID;

  const {
    data: booking,
    isLoading: isLoadingBooking,
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

  async function handlePreview() {
    setPageError(null);
    setPreview(null);

    if (!ratePlanId) {
      setPageError(
        "Seleccioná un plan tarifario.",
      );
      return;
    }

    try {
      const result =
        await calculateMutation.mutateAsync({
          resourceId,
          checkIn,
          checkOut,
        });

      setPreview(result);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "No pudimos calcular el precio.",
      );
    }
  }

  async function handleConfirm() {
    setPageError(null);

    if (!ratePlanId || !preview) {
      setPageError(
        "Calculá el precio antes de confirmar.",
      );
      return;
    }

    try {
      await confirmMutation.mutateAsync({
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      });

      navigate(
        `/app/bookings/${bookingId}`,
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "No pudimos confirmar la reserva.",
      );
    }
  }

  const loading =
    isLoadingBooking ||
    isLoadingResources ||
    isLoadingRatePlans;

  if (loading) {
    return (
      <section className="confirm-booking-page">
        <div className="confirm-booking-state">
          Cargando confirmación...
        </div>
      </section>
    );
  }

  if (
    isBookingError ||
    !booking
  ) {
    return (
      <section className="confirm-booking-page">
        <div
          className="confirm-booking-error"
          role="alert"
        >
          {bookingError instanceof Error
            ? bookingError.message
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
          La reserva no tiene Resource y fechas completas para poder confirmarse.
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
        <span>Booking</span>
        <h1>Confirmar reserva</h1>
        <p>
          Seleccioná la tarifa aplicable y revisá el precio antes de confirmar.
        </p>
      </header>

      <div className="confirm-booking-summary">
        <div>
          <Home
            size={17}
            aria-hidden="true"
          />

          <span>Alojamiento</span>

          <strong>
            {resource?.name ??
              "Resource"}
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
          <h2>Plan tarifario</h2>
          <p>
            Solo se muestran planes válidos para este alojamiento y estas fechas.
          </p>
        </div>

        {isRatePlansError ? (
          <div
            className="confirm-booking-error"
            role="alert"
          >
            {ratePlansError instanceof Error
              ? ratePlansError.message
              : "No pudimos cargar los planes tarifarios."}
          </div>
        ) : !ratePlans?.length ? (
          <div className="confirm-booking-empty">
            No hay planes tarifarios disponibles para esta estadía.
          </div>
        ) : (
          <label className="confirm-booking-field">
            <span>
              Plan tarifario
            </span>

            <select
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
            !ratePlanId ||
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
      </section>

      {preview && (
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
          disabled={
            !preview ||
            confirmMutation.isPending
          }
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