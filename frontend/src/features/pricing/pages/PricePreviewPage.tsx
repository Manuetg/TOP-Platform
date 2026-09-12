import {
  ArrowLeft,
  CalendarDays,
  ReceiptText,
} from "lucide-react";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useParams,
} from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useResources } from "../../resources/queries/use-resources";
import { PricingResourcePill } from "../components/PricingResourcePill";
import { useCalculatePrice } from "../queries/use-calculate-price";
import { useRatePlans } from "../queries/use-rate-plans";
import type { CalculatePriceResult } from "../types/pricing.types";
import "./PricePreviewPage.css";


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

export function PricePreviewPage() {
  const { session } = useAuth();
  const { ratePlanId = "" } = useParams();

  const { activeBusinessId: businessId } = useBusinessContext();

  const {
    data: ratePlans,
    isLoading: isLoadingPlans,
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

  const assignedResources = useMemo(() => {
    if (!ratePlan) {
      return [];
    }

    const assignedIds = new Set(
      ratePlan.resources.map(
        (resource) => resource.id,
      ),
    );

    return (resources ?? []).filter(
      (resource) =>
        assignedIds.has(resource.id) &&
        resource.status === "ACTIVE",
    );
  }, [ratePlan, resources]);

  const [resourceId, setResourceId] =
    useState("");

  const selectedResource = useMemo(
    () =>
      assignedResources.find(
        (resource) =>
          resource.id === resourceId,
      ),
    [assignedResources, resourceId],
  );
  const [checkIn, setCheckIn] =
    useState("");
  const [checkOut, setCheckOut] =
    useState("");
  const [formError, setFormError] =
    useState<string | null>(null);
  const [result, setResult] =
    useState<CalculatePriceResult | null>(
      null,
    );

  const calculation =
    useCalculatePrice({
      businessId,
      ratePlanId,
      accessToken: session?.accessToken,
    });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError(null);
    setResult(null);

    if (!resourceId) {
      setFormError(
        "Seleccioná un alojamiento.",
      );
      return;
    }

    if (!checkIn || !checkOut) {
      setFormError(
        "Ingresá check-in y check-out.",
      );
      return;
    }

    if (checkIn >= checkOut) {
      setFormError(
        "El check-in debe ser anterior al check-out.",
      );
      return;
    }

    try {
      const response =
        await calculation.mutateAsync({
          resourceId,
          checkIn,
          checkOut,
        });

      setResult(response);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos calcular el precio.",
      );
    }
  }

  if (
    isLoadingPlans ||
    isLoadingResources
  ) {
    return (
      <section className="price-preview-page">
        <p className="price-preview-muted">
          Cargando información...
        </p>
      </section>
    );
  }

  if (!ratePlan) {
    return (
      <section className="price-preview-page">
        <div className="price-preview-error">
          No encontramos este plan tarifario.
        </div>

        <Link
          to="/app/pricing"
          className="price-preview-back"
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
      <section className="price-preview-page">
        <div className="price-preview-error">
          Los planes archivados no pueden utilizarse para calcular precios.
        </div>

        <Link
          to="/app/pricing"
          className="price-preview-back"
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
    <section className="price-preview-page">
      <Link
        to="/app/pricing"
        className="price-preview-back"
      >
        <ArrowLeft
          size={17}
          aria-hidden="true"
        />
        Volver a planes
      </Link>

      <header className="price-preview-header">
        <span>Pricing</span>

        <h1>
          Vista previa de precio
        </h1>

        <p>
          {ratePlan.name}
        </p>
      </header>

      <form
        className="price-preview-form"
        onSubmit={handleSubmit}
      >
        <div className="price-preview-fields">
          <label className="price-preview-field">
            <span>Alojamiento</span>

            <select
              value={resourceId}
              onChange={(event) =>
                setResourceId(
                  event.target.value,
                )
              }
              required
            >
              <option value="">
                Seleccionar
              </option>

              {assignedResources.map(
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

          <label className="price-preview-field">
            <span>Check-in</span>

            <input
              type="date"
              value={checkIn}
              onChange={(event) =>
                setCheckIn(
                  event.target.value,
                )
              }
              required
            />
          </label>

          <label className="price-preview-field">
            <span>Check-out</span>

            <input
              type="date"
              value={checkOut}
              onChange={(event) =>
                setCheckOut(
                  event.target.value,
                )
              }
              required
            />
          </label>
        </div>

        {selectedResource && (
          <div className="price-preview-selected-resource">
            <span>Recurso seleccionado</span>

            <PricingResourcePill
              name={selectedResource.name}
            />
          </div>
        )}

        {assignedResources.length === 0 && (
          <p className="price-preview-muted">
            Este plan no tiene alojamientos ACTIVE asignados.
          </p>
        )}

        {formError && (
          <div
            className="price-preview-error"
            role="alert"
          >
            {formError}
          </div>
        )}

        <button
          type="submit"
          className="price-preview-submit"
          disabled={
            calculation.isPending ||
            assignedResources.length === 0
          }
        >
          {calculation.isPending
            ? "Calculando..."
            : "Calcular precio"}
        </button>
      </form>

      {result && (
        <div className="price-preview-result">
          <div className="price-preview-summary">
            <div>
              <span>Total</span>
              <strong>
                {formatMoney(
                  result.totalAmountMinor,
                  result.currency,
                )}
              </strong>
            </div>

            <div>
              <span>Noches</span>
              <strong>
                {result.nights}
              </strong>
            </div>

            <div>
              <span>Tarifa base</span>
              <strong>
                {formatMoney(
                  result.baseNightlyAmountMinor,
                  result.currency,
                )}
              </strong>
            </div>
          </div>

          <div className="price-preview-breakdown">
            <div className="price-preview-breakdown__heading">
              <ReceiptText
                size={18}
                aria-hidden="true"
              />

              <div>
                <h2>
                  Desglose por noche
                </h2>
              </div>
            </div>

            <div className="price-preview-night-list">
              {result.breakdown.map(
                (night) => (
                  <div
                    key={night.date}
                    className="price-preview-night"
                  >
                    <div className="price-preview-night__date">
                      <CalendarDays
                        size={15}
                        aria-hidden="true"
                      />

                      <span>
                        {formatDate(
                          night.date,
                        )}
                      </span>
                    </div>

                    <div className="price-preview-night__source">
                      <span>
                        {night.source ===
                        "SEASONAL"
                          ? night.seasonalRateName ??
                            "Temporada"
                          : "Tarifa base"}
                      </span>

                      <small>
                        {night.source ===
                        "SEASONAL"
                          ? "Estacional"
                          : "Base"}
                      </small>
                    </div>

                    <strong>
                      {formatMoney(
                        night.amountMinor,
                        result.currency,
                      )}
                    </strong>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
