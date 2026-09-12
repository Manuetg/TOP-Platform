import {
  ArrowLeft,
  Check,
} from "lucide-react";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../../resources/queries/use-resources";
import { useCreateRatePlan } from "../queries/use-create-rate-plan";
import "./CreateRatePlanPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function currencyToMinor(value: string) {
  const normalized = value
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function CreateRatePlanPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const businessId = TEMP_BUSINESS_ID;

  const [name, setName] =
    useState("");
  const [description, setDescription] =
    useState("");
  const [baseAmount, setBaseAmount] =
    useState("");
  const [validFrom, setValidFrom] =
    useState("");
  const [validTo, setValidTo] =
    useState("");
  const [resourceIds, setResourceIds] =
    useState<string[]>([]);
  const [formError, setFormError] =
    useState<string | null>(null);

  const {
    data: resources,
    isLoading: isLoadingResources,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const activeResources = useMemo(
    () =>
      (resources ?? []).filter(
        (resource) =>
          resource.status !== "ARCHIVED",
      ),
    [resources],
  );

  const createMutation =
    useCreateRatePlan({
      businessId,
      accessToken: session?.accessToken,
    });

  function toggleResource(
    resourceId: string,
  ) {
    setResourceIds((current) =>
      current.includes(resourceId)
        ? current.filter(
            (id) => id !== resourceId,
          )
        : [...current, resourceId],
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();

    if (
      trimmedName.length < 2 ||
      trimmedName.length > 120
    ) {
      setFormError(
        "El nombre debe tener entre 2 y 120 caracteres.",
      );
      return;
    }

    if (description.trim().length > 500) {
      setFormError(
        "La descripción no puede superar 500 caracteres.",
      );
      return;
    }

    const amountMinor =
      currencyToMinor(baseAmount);

    if (
      amountMinor === null ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      setFormError(
        "Ingresá una tarifa base válida.",
      );
      return;
    }

    if (
      validFrom &&
      validTo &&
      validFrom >= validTo
    ) {
      setFormError(
        "La fecha de inicio debe ser anterior a la fecha de fin.",
      );
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: trimmedName,
        description:
          description.trim() || null,
        baseNightlyAmountMinor:
          amountMinor,
        validFrom:
          validFrom || undefined,
        validTo:
          validTo || undefined,
        resourceIds,
      });

      navigate("/app/pricing");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos crear el plan tarifario.",
      );
    }
  }

  return (
    <section className="create-rate-plan-page">
      <div className="create-rate-plan-topbar">
        <Link
          to="/app/pricing"
          className="create-rate-plan-back"
        >
          <ArrowLeft
            size={17}
            aria-hidden="true"
          />
          Volver a planes
        </Link>
      </div>

      <div className="create-rate-plan-shell">
        <header className="create-rate-plan-header">
          <span>
            Pricing
          </span>

          <h1>
            Crear plan tarifario
          </h1>

          <p>
            Definí la tarifa base, vigencia y
            alojamientos asociados.
          </p>
        </header>

        <form
          className="create-rate-plan-form"
          onSubmit={handleSubmit}
        >
          <div className="create-rate-plan-section">
            <div className="create-rate-plan-section__heading">
              <h2>
                Información general
              </h2>
              <p>
                Datos principales del plan.
              </p>
            </div>

            <div className="create-rate-plan-fields">
              <label className="create-rate-plan-field create-rate-plan-field--full">
                <span>
                  Nombre
                </span>

                <input
                  type="text"
                  value={name}
                  maxLength={120}
                  onChange={(event) =>
                    setName(
                      event.target.value,
                    )
                  }
                  placeholder="Ej. Tarifa estándar"
                  required
                />
              </label>

              <label className="create-rate-plan-field create-rate-plan-field--full">
                <span>
                  Descripción
                  <small>
                    Opcional
                  </small>
                </span>

                <textarea
                  value={description}
                  maxLength={500}
                  rows={3}
                  onChange={(event) =>
                    setDescription(
                      event.target.value,
                    )
                  }
                  placeholder="Información interna sobre esta tarifa..."
                />
              </label>

              <label className="create-rate-plan-field">
                <span>
                  Tarifa base por noche
                </span>

                <input
                  type="text"
                  inputMode="decimal"
                  value={baseAmount}
                  onChange={(event) =>
                    setBaseAmount(
                      event.target.value,
                    )
                  }
                  placeholder="0"
                  required
                />

                <small>
                  Se guarda en la moneda del Business.
                </small>
              </label>
            </div>
          </div>

          <div className="create-rate-plan-section">
            <div className="create-rate-plan-section__heading">
              <h2>
                Vigencia
              </h2>
              <p>
                Ambas fechas son opcionales.
              </p>
            </div>

            <div className="create-rate-plan-fields">
              <label className="create-rate-plan-field">
                <span>
                  Desde
                </span>

                <input
                  type="date"
                  value={validFrom}
                  onChange={(event) =>
                    setValidFrom(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label className="create-rate-plan-field">
                <span>
                  Hasta
                </span>

                <input
                  type="date"
                  value={validTo}
                  onChange={(event) =>
                    setValidTo(
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>
          </div>

          <div className="create-rate-plan-section">
            <div className="create-rate-plan-section__heading">
              <h2>
                Alojamientos
              </h2>
              <p>
                Podés crear el plan sin asignaciones
                y vincular Resources después.
              </p>
            </div>

            {isLoadingResources ? (
              <p className="create-rate-plan-muted">
                Cargando alojamientos...
              </p>
            ) : activeResources.length === 0 ? (
              <p className="create-rate-plan-muted">
                No hay Resources disponibles para asignar.
              </p>
            ) : (
              <div className="create-rate-plan-resources">
                {activeResources.map(
                  (resource) => {
                    const selected =
                      resourceIds.includes(
                        resource.id,
                      );

                    return (
                      <label
                        key={resource.id}
                        className={`create-rate-plan-resource ${
                          selected
                            ? "create-rate-plan-resource--selected"
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleResource(
                              resource.id,
                            )
                          }
                        />

                        <div>
                          <strong>
                            {resource.name}
                          </strong>
                        </div>

                        {selected && (
                          <Check
                            size={17}
                            aria-hidden="true"
                          />
                        )}
                      </label>
                    );
                  },
                )}
              </div>
            )}
          </div>

          {formError && (
            <div
              className="create-rate-plan-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="create-rate-plan-actions">
            <Link
              to="/app/pricing"
              className="create-rate-plan-secondary"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className="create-rate-plan-primary"
              disabled={
                createMutation.isPending
              }
            >
              {createMutation.isPending
                ? "Creando..."
                : "Crear plan"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}