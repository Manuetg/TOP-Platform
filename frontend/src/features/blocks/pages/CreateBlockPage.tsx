import {
  ArrowLeft,
  Ban,
  CalendarClock,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../../resources/queries/use-resources";
import { useCreateBlock } from "../queries/use-create-block";
import type { BlockType } from "../types/block.types";
import "./CreateBlockPage.css";

interface CreateBlockPageProps {
  businessId?: string;
}

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function toIsoDateTime(value: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString();
}

export function CreateBlockPage({
  businessId = TEMP_BUSINESS_ID,
}: CreateBlockPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [resourceId, setResourceId] =
    useState("");
  const [type, setType] =
    useState<BlockType>("MAINTENANCE");
  const [reason, setReason] =
    useState("");
  const [notes, setNotes] =
    useState("");
  const [startsAt, setStartsAt] =
    useState("");
  const [endsAt, setEndsAt] =
    useState("");
  const [validationError, setValidationError] =
    useState<string | null>(null);

  const {
    data: resources,
    isLoading: resourcesLoading,
    isError: resourcesError,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const createMutation = useCreateBlock({
    businessId,
    accessToken: session?.accessToken,
  });

  const selectableResources = useMemo(
    () =>
      (resources ?? []).filter(
        (resource) =>
          resource.status !== "ARCHIVED",
      ),
    [resources],
  );

  function validate() {
    const normalizedReason = reason.trim();

    if (!resourceId) {
      return "Seleccioná un recurso.";
    }

    if (
      normalizedReason.length < 2 ||
      normalizedReason.length > 120
    ) {
      return "El motivo debe tener entre 2 y 120 caracteres.";
    }

    if (notes.trim().length > 500) {
      return "Las observaciones no pueden superar los 500 caracteres.";
    }

    if (!startsAt || !endsAt) {
      return "Indicá el inicio y el fin del bloqueo.";
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return "Las fechas ingresadas no son válidas.";
    }

    if (end <= start) {
      return "El fin debe ser posterior al inicio.";
    }

    return null;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setValidationError(null);

    const error = validate();

    if (error) {
      setValidationError(error);
      return;
    }

    try {
      await createMutation.mutateAsync({
        resourceId,
        type,
        reason: reason.trim(),
        notes:
          notes.trim().length > 0
            ? notes.trim()
            : null,
        startsAt: toIsoDateTime(startsAt),
        endsAt: toIsoDateTime(endsAt),
      });

      navigate("/app/blocks");
    } catch {
      // El error queda disponible en createMutation.error.
    }
  }

  if (resourcesLoading) {
    return (
      <section
        className="create-block-page"
        aria-busy="true"
      >
        <div className="create-block-state">
          <div
            className="create-block-state__icon"
            aria-hidden="true"
          >
            <Ban size={28} />
          </div>

          <h1>Preparando nuevo bloqueo</h1>
          <p>
            Estamos cargando los recursos disponibles.
          </p>
        </div>
      </section>
    );
  }

  if (resourcesError) {
    return (
      <section className="create-block-page">
        <div
          className="create-block-state"
          role="alert"
        >
          <div
            className="create-block-state__icon"
            aria-hidden="true"
          >
            <Ban size={28} />
          </div>

          <h1>No pudimos cargar los recursos</h1>
          <p>
            Volvé al listado e intentá nuevamente.
          </p>

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate("/app/blocks")
            }
          >
            Volver a bloqueos
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="create-block-page">
      <button
        type="button"
        className="create-block-back"
        onClick={() => navigate("/app/blocks")}
      >
        <ArrowLeft
          size={18}
          aria-hidden="true"
        />
        Volver a bloqueos
      </button>

      <header className="create-block-header">
        <div
          className="create-block-header__icon"
          aria-hidden="true"
        >
          <CalendarClock size={24} />
        </div>

        <div>
          <h1>Nuevo bloqueo</h1>
          <p>
            Bloqueá un recurso durante un período
            específico.
          </p>
        </div>
      </header>

      <form
        className="create-block-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <section className="create-block-section">
          <div className="create-block-section__heading">
            <h2>Información del bloqueo</h2>
            <p>
              Definí el recurso y el motivo del
              período no disponible.
            </p>
          </div>

          <div className="create-block-grid">
            <div className="create-block-field create-block-field--wide">
              <label htmlFor="create-block-resource">
                Recurso
                <span aria-hidden="true"> *</span>
              </label>

              <select
                id="create-block-resource"
                value={resourceId}
                onChange={(event) => {
                  setResourceId(event.target.value);
                  setValidationError(null);
                }}
                required
              >
                <option value="">
                  Seleccionar recurso
                </option>

                {selectableResources.map(
                  (resource) => (
                    <option
                      key={resource.id}
                      value={resource.id}
                    >
                      {resource.name}
                      {resource.status ===
                      "OUT_OF_SERVICE"
                        ? " — Fuera de servicio"
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="create-block-field">
              <label htmlFor="create-block-type">
                Tipo
                <span aria-hidden="true"> *</span>
              </label>

              <select
                id="create-block-type"
                value={type}
                onChange={(event) =>
                  setType(
                    event.target.value as BlockType,
                  )
                }
              >
                <option value="MAINTENANCE">
                  Mantenimiento
                </option>
                <option value="OWNER_USE">
                  Uso del propietario
                </option>
                <option value="OTHER">
                  Otro
                </option>
              </select>
            </div>

            <div className="create-block-field create-block-field--wide">
              <label htmlFor="create-block-reason">
                Motivo
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="create-block-reason"
                value={reason}
                maxLength={120}
                onChange={(event) => {
                  setReason(event.target.value);
                  setValidationError(null);
                }}
                placeholder="Ej. Mantenimiento del aire acondicionado"
              />

              <span className="create-block-field__counter">
                {reason.length}/120
              </span>
            </div>
          </div>
        </section>

        <section className="create-block-section">
          <div className="create-block-section__heading">
            <h2>Período</h2>
            <p>
              Indicá exactamente desde cuándo y
              hasta cuándo el recurso estará
              bloqueado.
            </p>
          </div>

          <div className="create-block-grid create-block-grid--dates">
            <div className="create-block-field">
              <label htmlFor="create-block-start">
                Inicio
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="create-block-start"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                  setValidationError(null);
                }}
              />
            </div>

            <div className="create-block-field">
              <label htmlFor="create-block-end">
                Fin
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="create-block-end"
                type="datetime-local"
                value={endsAt}
                min={startsAt || undefined}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                  setValidationError(null);
                }}
              />
            </div>
          </div>
        </section>

        <section className="create-block-section">
          <div className="create-block-section__heading">
            <h2>Observaciones</h2>
            <p>
              Información adicional opcional para
              el equipo.
            </p>
          </div>

          <div className="create-block-field">
            <label htmlFor="create-block-notes">
              Observaciones
            </label>

            <textarea
              id="create-block-notes"
              rows={5}
              maxLength={500}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setValidationError(null);
              }}
              placeholder="Agregá cualquier detalle relevante..."
            />

            <span className="create-block-field__counter">
              {notes.length}/500
            </span>
          </div>
        </section>

        {(validationError ||
          createMutation.isError) && (
          <div
            className="create-block-error"
            role="alert"
          >
            {validationError ??
              (createMutation.error instanceof Error
                ? createMutation.error.message
                : "No pudimos crear el bloqueo.")}
          </div>
        )}

        <div className="create-block-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={createMutation.isPending}
            onClick={() =>
              navigate("/app/blocks")
            }
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending
              ? "Creando..."
              : "Crear bloqueo"}
          </Button>
        </div>
      </form>
    </section>
  );
}