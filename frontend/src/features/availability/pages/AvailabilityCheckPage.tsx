import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Search,
} from "lucide-react";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../../resources/queries/use-resources";
import { AvailabilityNav } from "../components/AvailabilityNav";
import { useAvailabilityCheck } from "../queries/use-availability-check";
import type { AvailabilityReason } from "../types/availability.types";
import "./AvailabilityCheckPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

const REASON_LABELS: Record<
  AvailabilityReason,
  string
> = {
  RESOURCE_OUT_OF_SERVICE:
    "El recurso está fuera de servicio.",
  RESOURCE_ARCHIVED:
    "El recurso está archivado.",
  BOOKING_CONFLICT:
    "Existe una reserva que bloquea este rango.",
  BLOCK_CONFLICT:
    "Existe un bloqueo operativo en este rango.",
};

function todayLocal() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: string, days: number) {
  if (!date) {
    return "";
  }

  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

export function AvailabilityCheckPage() {
  const { session } = useAuth();

  const [resourceId, setResourceId] =
    useState("");

  const [from, setFrom] =
    useState(todayLocal());

  const [to, setTo] =
    useState(addDays(todayLocal(), 1));

  const [submitted, setSubmitted] =
    useState(false);

  const [validationError, setValidationError] =
    useState<string | null>(null);

  const {
    data: resources = [],
    isLoading: resourcesLoading,
    isError: resourcesError,
  } = useResources({
    businessId: TEMP_BUSINESS_ID,
    accessToken: session?.accessToken,
  });

  const activeResources = useMemo(
    () =>
      resources.filter(
        (resource) =>
          resource.status !== "ARCHIVED",
      ),
    [resources],
  );

  const {
    data: result,
    isLoading,
    isFetching,
    isError,
    error,
  } = useAvailabilityCheck({
    businessId: TEMP_BUSINESS_ID,
    resourceId,
    from,
    to,
    accessToken: session?.accessToken,
    enabled: submitted,
  });

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSubmitted(false);
    setValidationError(null);

    if (!resourceId) {
      setValidationError(
        "Seleccioná un recurso.",
      );
      return;
    }

    if (!from || !to) {
      setValidationError(
        "Seleccioná la fecha de entrada y salida.",
      );
      return;
    }

    if (to <= from) {
      setValidationError(
        "La fecha de salida debe ser posterior a la fecha de entrada.",
      );
      return;
    }

    setSubmitted(true);
  }

  return (
    <section
      className="availability-check-page"
      aria-labelledby="availability-check-title"
    >
      <header className="availability-check-header">
        <span className="availability-check-eyebrow">
          Disponibilidad
        </span>

        <h1 id="availability-check-title">
          Consultar disponibilidad
        </h1>

        <p>
          Verificá si un recurso está disponible para
          un rango de fechas.
        </p>
      </header>

      <AvailabilityNav />

      <div className="availability-check-layout">
        <form
          className="availability-check-card"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="availability-check-card__header">
            <div className="availability-check-card__icon">
              <CalendarDays
                size={20}
                aria-hidden="true"
              />
            </div>

            <div>
              <h2>Nueva consulta</h2>
            </div>
          </div>

          <div className="availability-check-fields">
            <label className="availability-check-field availability-check-field--full">
              <span>Recurso</span>

              <select
                value={resourceId}
                onChange={(event) => {
                  setResourceId(
                    event.target.value,
                  );
                  setSubmitted(false);
                }}
                disabled={
                  resourcesLoading ||
                  resourcesError
                }
              >
                <option value="">
                  {resourcesLoading
                    ? "Cargando recursos..."
                    : "Seleccionar recurso"}
                </option>

                {activeResources.map(
                  (resource) => (
                    <option
                      key={resource.id}
                      value={resource.id}
                    >
                      {resource.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="availability-check-field">
              <span>Entrada</span>

              <input
                type="date"
                value={from}
                min={todayLocal()}
                onChange={(event) => {
                  const value =
                    event.target.value;

                  setFrom(value);
                  setSubmitted(false);

                  if (
                    value &&
                    (!to || to <= value)
                  ) {
                    setTo(addDays(value, 1));
                  }
                }}
              />
            </label>

            <label className="availability-check-field">
              <span>Salida</span>

              <input
                type="date"
                value={to}
                min={
                  from
                    ? addDays(from, 1)
                    : todayLocal()
                }
                onChange={(event) => {
                  setTo(event.target.value);
                  setSubmitted(false);
                }}
              />
            </label>
          </div>

          {resourcesError && (
            <div
              className="availability-check-message availability-check-message--error"
              role="alert"
            >
              No pudimos cargar los recursos.
            </div>
          )}

          {validationError && (
            <div
              className="availability-check-message availability-check-message--error"
              role="alert"
            >
              {validationError}
            </div>
          )}

          <div className="availability-check-actions">
            <Button
              type="submit"
              disabled={
                resourcesLoading ||
                resourcesError ||
                isFetching
              }
            >
              <Search
                size={18}
                aria-hidden="true"
              />

              {isFetching
                ? "Consultando…"
                : "Consultar disponibilidad"}
            </Button>
          </div>
        </form>

        <aside
          className="availability-result-card"
          aria-live="polite"
        >
          {!submitted && !result && (
            <div className="availability-result-empty">
              <div className="availability-result-empty__icon">
                <CalendarDays
                  size={28}
                  aria-hidden="true"
                />
              </div>

              <h2>
                Resultado de disponibilidad
              </h2>

              <p>
                Seleccioná un recurso y un rango para
                consultar.
              </p>
            </div>
          )}

          {submitted && isLoading && (
            <div
              className="availability-result-empty"
              role="status"
            >
              <div className="availability-result-empty__icon">
                <Search
                  size={28}
                  aria-hidden="true"
                />
              </div>

              <h2>Consultando disponibilidad</h2>

              <p>
                Estamos verificando el rango seleccionado.
              </p>
            </div>
          )}

          {submitted && isError && (
            <div
              className="availability-result-empty"
              role="alert"
            >
              <div className="availability-result-empty__icon availability-result-empty__icon--error">
                <AlertCircle
                  size={28}
                  aria-hidden="true"
                />
              </div>

              <h2>
                No pudimos consultar la disponibilidad
              </h2>

              <p>
                {error instanceof Error
                  ? error.message
                  : "Ocurrió un error inesperado."}
              </p>
            </div>
          )}

          {submitted &&
            result &&
            !isError && (
              <div
                className={`availability-result availability-result--${result.status.toLowerCase()}`}
              >
                <div className="availability-result__status">
                  <div className="availability-result__icon">
                    {result.status ===
                    "AVAILABLE" ? (
                      <CheckCircle2
                        size={30}
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertCircle
                        size={30}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div>
                    <span>Resultado</span>

                    <h2>
                      {result.status ===
                      "AVAILABLE"
                        ? "Disponible"
                        : "No disponible"}
                    </h2>
                  </div>
                </div>

                <div className="availability-result__range">
                  <div>
                    <span>Entrada</span>
                    <strong>
                      {result.from}
                    </strong>
                  </div>

                  <div>
                    <span>Salida</span>
                    <strong>
                      {result.to}
                    </strong>
                  </div>
                </div>

                {result.reasons.length >
                  0 && (
                  <div className="availability-result__reasons">
                    <span>Motivos</span>

                    <ul>
                      {result.reasons.map(
                        (reason) => (
                          <li key={reason}>
                            {
                              REASON_LABELS[
                                reason
                              ]
                            }
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </aside>
      </div>
    </section>
  );
}