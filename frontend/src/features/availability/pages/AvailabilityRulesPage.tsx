import {
  AlertCircle,
  Clock3,
  Info,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { AvailabilityNav } from "../components/AvailabilityNav";
import {
  useAvailabilityRules,
  useUpdateAvailabilityRules,
} from "../queries/use-availability-rules";
import "./AvailabilityRulesPage.css";


export function AvailabilityRulesPage() {
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();

  const {
    data: rules,
    isLoading,
    isError,
    error,
    refetch,
  } = useAvailabilityRules({
    businessId: activeBusinessId,
    accessToken: session?.accessToken,
  });

  const updateRules =
    useUpdateAvailabilityRules({
      businessId: activeBusinessId,
      accessToken: session?.accessToken,
    });

  const [
    pendingBlocksAvailability,
    setPendingBlocksAvailability,
  ] = useState(true);

  const [
    bufferBeforeDays,
    setBufferBeforeDays,
  ] = useState("0");

  const [
    bufferAfterDays,
    setBufferAfterDays,
  ] = useState("0");

  const [
    validationError,
    setValidationError,
  ] = useState<string | null>(null);

  const [
    savedMessage,
    setSavedMessage,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!rules) {
      return;
    }

    setPendingBlocksAvailability(
      rules.pendingBlocksAvailability,
    );

    setBufferBeforeDays(
      String(rules.bufferBeforeDays),
    );

    setBufferAfterDays(
      String(rules.bufferAfterDays),
    );
  }, [rules]);

  function validateDays(
    value: string,
  ) {
    const number = Number(value);

    return (
      Number.isSafeInteger(number) &&
      number >= 0
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setValidationError(null);
    setSavedMessage(null);

    if (
      !validateDays(bufferBeforeDays) ||
      !validateDays(bufferAfterDays)
    ) {
      setValidationError(
        "Los buffers deben ser números enteros iguales o mayores a 0.",
      );
      return;
    }

    try {
      await updateRules.mutateAsync({
        pendingBlocksAvailability,
        bufferBeforeDays:
          Number(bufferBeforeDays),
        bufferAfterDays:
          Number(bufferAfterDays),
      });

      setSavedMessage(
        "Reglas guardadas correctamente.",
      );
    } catch {
      // El error se muestra desde el estado de la mutation.
    }
  }

  return (
    <section
      className="availability-rules-page"
      aria-labelledby="availability-rules-title"
    >
      <header className="availability-rules-header">
        <span className="availability-rules-eyebrow">
          Disponibilidad
        </span>

        <h1 id="availability-rules-title">
          Reglas de disponibilidad
        </h1>

        <p>
          Configurá cómo las reservas pendientes y
          los buffers afectan la disponibilidad.
        </p>
      </header>

      <AvailabilityNav />

      {isLoading && (
        <div
          className="availability-rules-state"
          role="status"
        >
          <RefreshCw
            size={24}
            aria-hidden="true"
          />

          <strong>
            Cargando reglas
          </strong>

          <span>
            Consultando la configuración actual.
          </span>
        </div>
      )}

      {isError && (
        <div
          className="availability-rules-state"
          role="alert"
        >
          <AlertCircle
            size={24}
            aria-hidden="true"
          />

          <strong>
            No pudimos cargar las reglas
          </strong>

          <span>
            {error instanceof Error
              ? error.message
              : "Ocurrió un error inesperado."}
          </span>

          <Button
            type="button"
            onClick={() => void refetch()}
          >
            Reintentar
          </Button>
        </div>
      )}

      {!isLoading &&
        !isError &&
        rules && (
          <form
            className="availability-rules-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <section className="availability-rules-card">
              <div className="availability-rules-card__heading">
                <div className="availability-rules-card__icon">
                  <Clock3
                    size={20}
                    aria-hidden="true"
                  />
                </div>

                <div>
                  <h2>
                    Reservas pendientes
                  </h2>

                  <p>
                    Define si una Booking en estado
                    PENDING debe impedir nuevas
                    disponibilidades.
                  </p>
                </div>
              </div>

              <label className="availability-rules-switch">
                <span>
                  <strong>
                    PENDING bloquea disponibilidad
                  </strong>

                  <small>
                    Si está activo, una reserva
                    pendiente se considera al
                    calcular Availability.
                  </small>
                </span>

                <input
                  type="checkbox"
                  checked={
                    pendingBlocksAvailability
                  }
                  onChange={(event) => {
                    setPendingBlocksAvailability(
                      event.target.checked,
                    );
                    setSavedMessage(null);
                  }}
                />

                <span
                  className="availability-rules-switch__visual"
                  aria-hidden="true"
                />
              </label>
            </section>

            <section className="availability-rules-card">
              <div className="availability-rules-card__heading">
                <div className="availability-rules-card__icon">
                  <Clock3
                    size={20}
                    aria-hidden="true"
                  />
                </div>

                <div>
                  <h2>
                    Buffers entre reservas
                  </h2>

                  <p>
                    Agregá días de margen antes o
                    después de una Booking.
                  </p>
                </div>
              </div>

              <div className="availability-rules-buffer-grid">
                <label className="availability-rules-field">
                  <span>
                    Buffer antes
                  </span>

                  <div className="availability-rules-number">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={
                        bufferBeforeDays
                      }
                      onChange={(event) => {
                        setBufferBeforeDays(
                          event.target.value,
                        );
                        setSavedMessage(null);
                      }}
                    />

                    <span>días</span>
                  </div>

                  <small>
                    Margen previo a una reserva.
                  </small>
                </label>

                <label className="availability-rules-field">
                  <span>
                    Buffer después
                  </span>

                  <div className="availability-rules-number">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={
                        bufferAfterDays
                      }
                      onChange={(event) => {
                        setBufferAfterDays(
                          event.target.value,
                        );
                        setSavedMessage(null);
                      }}
                    />

                    <span>días</span>
                  </div>

                  <small>
                    Margen posterior a una reserva.
                  </small>
                </label>
              </div>

              <div className="availability-rules-info">
                <Info
                  size={18}
                  aria-hidden="true"
                />

                <p>
                  Los buffers afectan conflictos
                  con Booking. Los Block utilizan
                  directamente su propio rango.
                </p>
              </div>
            </section>

            {validationError && (
              <div
                className="availability-rules-message availability-rules-message--error"
                role="alert"
              >
                {validationError}
              </div>
            )}

            {updateRules.isError && (
              <div
                className="availability-rules-message availability-rules-message--error"
                role="alert"
              >
                {updateRules.error instanceof Error
                  ? updateRules.error.message
                  : "No pudimos guardar las reglas."}
              </div>
            )}

            {savedMessage && (
              <div
                className="availability-rules-message availability-rules-message--success"
                role="status"
              >
                {savedMessage}
              </div>
            )}

            <div className="availability-rules-actions">
              <Button
                type="submit"
                disabled={
                  updateRules.isPending
                }
              >
                <Save
                  size={18}
                  aria-hidden="true"
                />

                {updateRules.isPending
                  ? "Guardando…"
                  : "Guardar cambios"}
              </Button>
            </div>
          </form>
        )}
    </section>
  );
}
