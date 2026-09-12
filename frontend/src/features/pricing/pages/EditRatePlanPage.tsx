import {
  ArrowLeft,
  Check,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useResources } from "../../resources/queries/use-resources";
import { useRatePlans } from "../queries/use-rate-plans";
import { useUpdateRatePlan } from "../queries/use-update-rate-plan";
import "./CreateRatePlanPage.css";


function minorToCurrency(value: number) {
  return String(value / 100);
}

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

export function EditRatePlanPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { ratePlanId = "" } = useParams();

  const { activeBusinessId: businessId } = useBusinessContext();

  const {
    data: ratePlans,
    isLoading: isLoadingPlans,
    isError: isPlansError,
  } = useRatePlans({
    businessId,
    accessToken: session?.accessToken,
  });

  const {
    data: resources,
    isLoading: isLoadingResources,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const ratePlan = useMemo(
    () =>
      (ratePlans ?? []).find(
        (plan) => plan.id === ratePlanId,
      ),
    [ratePlans, ratePlanId],
  );

  const activeResources = useMemo(
    () =>
      (resources ?? []).filter(
        (resource) =>
          resource.status !== "ARCHIVED",
      ),
    [resources],
  );

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

  useEffect(() => {
    if (!ratePlan) {
      return;
    }

    setName(ratePlan.name);
    setDescription(
      ratePlan.description ?? "",
    );
    setBaseAmount(
      minorToCurrency(
        ratePlan.baseNightlyAmountMinor,
      ),
    );
    setValidFrom(
      ratePlan.validFrom ?? "",
    );
    setValidTo(
      ratePlan.validTo ?? "",
    );
    setResourceIds(
      ratePlan.resources.map(
        (resource) => resource.id,
      ),
    );
  }, [ratePlan]);

  const updateMutation =
    useUpdateRatePlan({
      businessId,
      ratePlanId,
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

    if (!ratePlan) {
      return;
    }

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
      await updateMutation.mutateAsync({
        name: trimmedName,
        description:
          description.trim() || null,
        baseNightlyAmountMinor:
          amountMinor,
        validFrom:
          validFrom || null,
        validTo:
          validTo || null,
        resourceIds,
      });

      navigate("/app/pricing");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar el plan tarifario.",
      );
    }
  }

  if (isLoadingPlans) {
    return (
      <section className="create-rate-plan-page">
        <p className="create-rate-plan-muted">
          Cargando plan tarifario...
        </p>
      </section>
    );
  }

  if (
    isPlansError ||
    !ratePlan
  ) {
    return (
      <section className="create-rate-plan-page">
        <div className="create-rate-plan-error">
          No encontramos este plan tarifario.
        </div>

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
      </section>
    );
  }

  if (ratePlan.status === "ARCHIVED") {
    return (
      <section className="create-rate-plan-page">
        <div className="create-rate-plan-error">
          Los planes archivados no pueden editarse.
        </div>

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
      </section>
    );
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
          <span>Pricing</span>

          <h1>
            Editar plan tarifario
          </h1>

          <p>
            Actualizá precio, vigencia y
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
            </div>

            <div className="create-rate-plan-fields">
              <label className="create-rate-plan-field create-rate-plan-field--full">
                <span>Nombre</span>

                <input
                  type="text"
                  value={name}
                  maxLength={120}
                  onChange={(event) =>
                    setName(
                      event.target.value,
                    )
                  }
                  required
                />
              </label>

              <label className="create-rate-plan-field create-rate-plan-field--full">
                <span>
                  Descripción
                  <small>Opcional</small>
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
                  required
                />
              </label>
            </div>
          </div>

          <div className="create-rate-plan-section">
            <div className="create-rate-plan-section__heading">
              <h2>Vigencia</h2>

              <p>
                Vaciar una fecha elimina ese límite.
              </p>
            </div>

            <div className="create-rate-plan-fields">
              <label className="create-rate-plan-field">
                <span>Desde</span>

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
                <span>Hasta</span>

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
              <h2>Alojamientos</h2>
              <p>
                Ajustá los Resources asociados
                al plan.
              </p>
            </div>

            {isLoadingResources ? (
              <p className="create-rate-plan-muted">
                Cargando alojamientos...
              </p>
            ) : activeResources.length === 0 ? (
              <p className="create-rate-plan-muted">
                No hay Resources disponibles.
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
                updateMutation.isPending
              }
            >
              {updateMutation.isPending
                ? "Guardando..."
                : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
