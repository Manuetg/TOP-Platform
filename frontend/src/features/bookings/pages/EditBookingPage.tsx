import {
  ArrowLeft,
  ClipboardList,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useIsPresent } from "motion/react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import {
  BookingDraftForm,
  type BookingDraftFormInitialValues,
} from "../components/BookingDraftForm";
import { useBooking } from "../queries/use-booking";
import { BookingAmendmentForm } from "../components/BookingAmendmentForm";
import { useUpdateBooking } from "../queries/use-update-booking";
import type { CreateBookingInput } from "../types/booking.types";
import "./CreateBookingPage.css";

interface EditBookingPageProps {
  businessId?: string;
}


export function EditBookingPage({
  businessId: suppliedBusinessId,
}: EditBookingPageProps = {}) {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams();
  const { session, status: authStatus } = useAuth();
  const { activeBusinessId, activeBusiness, activeRole, status: businessStatus } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;
  const canEdit = authStatus === "authenticated" && Boolean(session?.user.id && session.accessToken && bookingId && businessId) &&
    businessStatus === "ready" && activeBusiness?.id === businessId && activeBusinessId === businessId &&
    (activeRole === "OWNER" || activeRole === "ADMIN" || activeRole === "RECEPTIONIST");

  if (!canEdit) {
    return <section className="create-booking-page">
      <div className="create-booking-state" role="alert">
        <h1>No tienes permiso para editar esta reserva.</h1>
        <Button variant="secondary" onClick={() => navigate(bookingId ? `/app/bookings/${bookingId}` : "/app/bookings")}>Volver a la reserva</Button>
      </div>
    </section>;
  }

  return <EditBookingContent
    key={`${session?.user.id}:${businessId}:${bookingId}:${activeRole}`}
    businessId={businessId}
  />;
}

function EditBookingContent({ businessId }: { businessId: string }) {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams();
  const { session, status: authStatus } = useAuth();
  const { activeBusiness, activeRole, status: businessStatus } = useBusinessContext();
  const isPresent = useIsPresent();
  const present = useRef(isPresent);
  present.current = isPresent;
  const alive = useRef(false);
  const canEdit = authStatus === "authenticated" && businessStatus === "ready" &&
    (activeRole === "OWNER" || activeRole === "ADMIN" || activeRole === "RECEPTIONIST");
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const {
    data: booking,
    isLoading,
    isError,
    error,
    refetch,
  } = useBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const updateMutation = useUpdateBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const [amendmentNotice, setAmendmentNotice] = useState<string | null>(null);
  const observedVersion = useRef<string | null>(null);
  useEffect(() => {
    if (!booking || !["PENDING", "CONFIRMED"].includes(booking.status)) return;
    const currentVersion = `${booking.updatedAt}:${booking.financialSummary?.financialVersion ?? "unknown"}`;
    if (observedVersion.current && observedVersion.current !== currentVersion) {
      setAmendmentNotice((previous) => previous ?? "La reserva cambió. Volvimos a cargar los datos actuales; revisá los cambios nuevamente.");
    }
    observedVersion.current = currentVersion;
  }, [booking]);

  if (isLoading) {
    return (
      <section
        className="create-booking-page"
        aria-busy="true"
      >
        <div className="create-booking-state">
          <div
            className="create-booking-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>Cargando borrador</h1>
          <p>
            Estamos preparando los datos de la
            reserva.
          </p>
        </div>
      </section>
    );
  }

  if (isError || !booking) {
    return (
      <section className="create-booking-page">
        <div
          className="create-booking-state"
          role="alert"
        >
          <div
            className="create-booking-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>
            No pudimos cargar la reserva
          </h1>

          <p>
            {error instanceof Error
              ? error.message
              : "La reserva no está disponible."}
          </p>

          <div className="booking-detail-state__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate("/app/bookings")
              }
            >
              Volver
            </Button>

            <Button
              type="button"
              onClick={() =>
                void refetch()
              }
            >
              Reintentar
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const currentBookingId = booking.id;

  if (booking.id === bookingId && booking.businessId === businessId && booking.resourceIds.length === 1 &&
    ["PENDING", "CONFIRMED"].includes(booking.status) && booking.financialSummary?.totalAmountMinor != null &&
    Number.isSafeInteger(booking.financialSummary.financialVersion) && booking.financialSummary.financialVersion >= 0 && activeBusiness?.status === "ACTIVE") {
    return <BookingAmendmentForm key={`${session?.user.id}:${businessId}:${bookingId}:${activeRole}:${activeBusiness.status}:${booking.updatedAt}:${booking.financialSummary.financialVersion}`} booking={booking} businessId={businessId}
      notice={amendmentNotice} onStalePreview={async () => {
        setAmendmentNotice("La reserva cambió antes de revisar. Cargá los datos actuales antes de revisar nuevamente.");
        const response = await refetch();
        if (response.isError) throw response.error;
        if (!alive.current || !present.current || !canEdit) return;
        setAmendmentNotice("La reserva cambió antes de revisar. Volvimos a cargar los datos actuales; revisá los cambios nuevamente.");
      }} />;
  }

  if (booking.status !== "DRAFT") {
    return (
      <section className="create-booking-page">
        <button
          type="button"
          className="create-booking-back"
          onClick={() =>
            navigate(
              `/app/bookings/${currentBookingId}`,
            )
          }
        >
          <ArrowLeft
            size={18}
            aria-hidden="true"
          />
          Reserva
        </button>

        <div
          className="create-booking-state"
          role="alert"
        >
          <div
            className="create-booking-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>
            Esta reserva ya no es editable
          </h1>

          <p>
            Podés editar borradores o reservas Pendiente y Confirmada con precio acordado dentro de un negocio activo.
          </p>

          <Button
            type="button"
            onClick={() =>
              navigate(
                `/app/bookings/${currentBookingId}`,
              )
            }
          >
            Ver reserva
          </Button>
        </div>
      </section>
    );
  }

  const initialValues:
    BookingDraftFormInitialValues = {
      contactId:
        booking.contactId ?? "",
      resourceId:
        booking.resourceIds[0] ?? "",
      checkInDate:
        booking.checkInDate ?? "",
      checkOutDate:
        booking.checkOutDate ?? "",
      adults:
        booking.adults === null
          ? ""
          : String(booking.adults),
      children:
        booking.children === null
          ? ""
          : String(booking.children),
      notes:
        booking.notes ?? "",
    };

  async function handleSubmit(
    input: CreateBookingInput,
  ) {
    if (!alive.current || !present.current || !canEdit || booking?.status !== "DRAFT") return;
    updateMutation.reset();

    try {
      await updateMutation.mutateAsync(
        input,
      );

      if (!alive.current || !present.current) return;
      navigate(
        `/app/bookings/${currentBookingId}`,
      );
    } catch {
      // El error se presenta desde la mutación.
    }
  }

  const errorMessage =
    updateMutation.isError
      ? updateMutation.error instanceof Error
        ? updateMutation.error.message
        : "No pudimos actualizar la reserva."
      : null;

  return (
    <section className="create-booking-page">
      <button
        type="button"
        className="create-booking-back"
        onClick={() =>
          navigate(
            `/app/bookings/${currentBookingId}`,
          )
        }
      >
        <ArrowLeft
          size={18}
          aria-hidden="true"
        />
        Reserva
      </button>

      <header className="create-booking-header">
        <div>
          <span className="create-booking-eyebrow">
            Reserva
          </span>

          <h1>Editar borrador</h1>

          <p>
            Modificá los datos antes de pasar a pendiente
            la reserva.
          </p>
        </div>

        <span className="create-booking-draft-badge">
          Borrador
        </span>
      </header>

      <BookingDraftForm
        businessId={businessId}
        initialValues={initialValues}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando..."
        isPending={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate(
            `/app/bookings/${currentBookingId}`,
          )
        }
      />
    </section>
  );
}
