import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { BookingDraftForm } from "../components/BookingDraftForm";
import { useCreateBooking } from "../queries/use-create-booking";
import type { CreateBookingInput } from "../types/booking.types";
import "./CreateBookingPage.css";

interface CreateBookingPageProps {
  businessId?: string;
}

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

export function CreateBookingPage({
  businessId = TEMP_BUSINESS_ID,
}: CreateBookingPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();

  const createMutation = useCreateBooking({
    businessId,
    accessToken: session?.accessToken,
  });

  async function handleSubmit(
    input: CreateBookingInput,
  ) {
    createMutation.reset();

    try {
      const booking =
        await createMutation.mutateAsync(
          input,
        );

      navigate(
        `/app/bookings/${booking.id}`,
      );
    } catch {
      // El error se presenta desde la mutación.
    }
  }

  const errorMessage =
    createMutation.isError
      ? createMutation.error instanceof Error
        ? createMutation.error.message
        : "No pudimos crear la reserva."
      : null;

  return (
    <section className="create-booking-page">
      <button
        type="button"
        className="create-booking-back"
        onClick={() =>
          navigate("/app/bookings")
        }
      >
        <ArrowLeft
          size={18}
          aria-hidden="true"
        />
        Reservas
      </button>

      <header className="create-booking-header">
        <div>
          <span className="create-booking-eyebrow">
            Nueva reserva
          </span>

          <h1>Crear borrador</h1>

          <p>
            Podés guardar la reserva aunque
            todavía falten datos.
          </p>
        </div>

        <span className="create-booking-draft-badge">
          Borrador
        </span>
      </header>

      <BookingDraftForm
        businessId={businessId}
        submitLabel="Guardar borrador"
        pendingLabel="Guardando..."
        isPending={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate("/app/bookings")
        }
      />
    </section>
  );
}