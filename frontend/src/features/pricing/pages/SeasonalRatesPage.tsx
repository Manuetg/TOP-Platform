import {
  ArrowLeft,
  CalendarDays,
  Plus,
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
import { useCreateSeasonalRate } from "../queries/use-create-seasonal-rate";
import { useRatePlans } from "../queries/use-rate-plans";
import { useSeasonalRates } from "../queries/use-seasonal-rates";
import "./SeasonalRatesPage.css";

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

export function SeasonalRatesPage() {
  const { session } = useAuth();
  const { ratePlanId = "" } = useParams();

  const businessId = TEMP_BUSINESS_ID;

  const {
    data: ratePlans,
    isLoading: isLoadingPlans,
  } = useRatePlans({
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

  const {
    data: seasonalRates,
    isLoading,
    isError,
    error,
    refetch,
  } = useSeasonalRates({
    businessId,
    ratePlanId,
    accessToken: session?.accessToken,
  });

  const createMutation =
    useCreateSeasonalRate({
      businessId,
      ratePlanId,
      accessToken: session?.accessToken,
    });

  const [isCreating, setIsCreating] =
    useState(false);
  const [name, setName] =
    useState("");
  const [amount, setAmount] =
    useState("");
  const [startDate, setStartDate] =
    useState("");
  const [endDate, setEndDate] =
    useState("");
  const [formError, setFormError] =
    useState<string | null>(null);

  function resetForm() {
    setName("");
    setAmount("");
    setStartDate("");
    setEndDate("");
    setFormError(null);
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

    const amountMinor =
      currencyToMinor(amount);

    if (
      amountMinor === null ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      setFormError(
        "Ingresá un importe de temporada válido.",
      );
      return;
    }

    if (!startDate || !endDate) {
      setFormError(
        "Las fechas de inicio y fin son obligatorias.",
      );
      return;
    }

    if (startDate >= endDate) {
      setFormError(
        "La fecha de inicio debe ser anterior a la fecha de fin.",
      );
      return;
    }

    if (
      ratePlan?.validFrom &&
      startDate < ratePlan.validFrom
    ) {
      setFormError(
        "La temporada no puede comenzar antes de la vigencia del plan.",
      );
      return;
    }

    if (
      ratePlan?.validTo &&
      endDate > ratePlan.validTo
    ) {
      setFormError(
        "La temporada no puede terminar después de la vigencia del plan.",
      );
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: trimmedName,
        amountMinor,
        startDate,
        endDate,
      });

      resetForm();
      setIsCreating(false);
    } catch (mutationError) {
      setFormError(
        mutationError instanceof Error
          ? mutationError.message
          : "No pudimos crear la temporada.",
      );
    }
  }

  if (isLoadingPlans) {
    return (
      <section className="seasonal-rates-page">
        <p className="seasonal-rates-muted">
          Cargando plan tarifario...
        </p>
      </section>
    );
  }

  if (!ratePlan) {
    return (
      <section className="seasonal-rates-page">
        <div
          className="seasonal-rates-error"
          role="alert"
        >
          No encontramos este plan tarifario.
        </div>

        <Link
          to="/app/pricing"
          className="seasonal-rates-back"
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
      <section className="seasonal-rates-page">
        <div
          className="seasonal-rates-error"
          role="alert"
        >
          Los planes archivados no admiten nuevas temporadas.
        </div>

        <Link
          to="/app/pricing"
          className="seasonal-rates-back"
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
    <section className="seasonal-rates-page">
      <Link
        to="/app/pricing"
        className="seasonal-rates-back"
      >
        <ArrowLeft
          size={17}
          aria-hidden="true"
        />
        Volver a planes
      </Link>

      <header className="seasonal-rates-header">
        <div>
          <span className="seasonal-rates-eyebrow">
            Pricing
          </span>

          <h1>
            Tarifas estacionales
          </h1>

          <p>
            {ratePlan.name}
          </p>
        </div>

        <button
          type="button"
          className="seasonal-rates-create"
          onClick={() =>
            setIsCreating((current) => !current)
          }
        >
          <Plus
            size={17}
            aria-hidden="true"
          />
          Nueva temporada
        </button>
      </header>

      <div className="seasonal-rates-plan">
        <div>
          <span>Tarifa base</span>
          <strong>
            {formatMoney(
              ratePlan.baseNightlyAmountMinor,
              ratePlan.currency,
            )}
          </strong>
        </div>

        <div>
          <span>Vigencia</span>
          <strong>
            {ratePlan.validFrom
              ? formatDate(ratePlan.validFrom)
              : "Sin inicio"}
            {" → "}
            {ratePlan.validTo
              ? formatDate(ratePlan.validTo)
              : "Sin fin"}
          </strong>
        </div>
      </div>

      {isCreating && (
        <form
          className="seasonal-rates-form"
          onSubmit={handleSubmit}
        >
          <div className="seasonal-rates-form__heading">
            <h2>
              Nueva temporada
            </h2>

            <p>
              El importe reemplaza la tarifa base durante este rango.
            </p>
          </div>

          <div className="seasonal-rates-fields">
            <label className="seasonal-rates-field seasonal-rates-field--wide">
              <span>
                Nombre
              </span>

              <input
                type="text"
                value={name}
                maxLength={120}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Ej. Temporada alta"
                required
              />
            </label>

            <label className="seasonal-rates-field">
              <span>
                Importe por noche
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                placeholder="0"
                required
              />

              <small>
                Moneda: {ratePlan.currency}
              </small>
            </label>

            <label className="seasonal-rates-field">
              <span>
                Desde
              </span>

              <input
                type="date"
                value={startDate}
                min={ratePlan.validFrom ?? undefined}
                max={ratePlan.validTo ?? undefined}
                onChange={(event) =>
                  setStartDate(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label className="seasonal-rates-field">
              <span>
                Hasta
              </span>

              <input
                type="date"
                value={endDate}
                min={ratePlan.validFrom ?? undefined}
                max={ratePlan.validTo ?? undefined}
                onChange={(event) =>
                  setEndDate(
                    event.target.value,
                  )
                }
                required
              />
            </label>
          </div>

          {formError && (
            <div
              className="seasonal-rates-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="seasonal-rates-form__actions">
            <button
              type="button"
              className="seasonal-rates-secondary"
              onClick={() => {
                resetForm();
                setIsCreating(false);
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="seasonal-rates-primary"
              disabled={
                createMutation.isPending
              }
            >
              {createMutation.isPending
                ? "Creando..."
                : "Crear temporada"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="seasonal-rates-state">
          Cargando temporadas...
        </div>
      ) : isError ? (
        <div
          className="seasonal-rates-state"
          role="alert"
        >
          <p>
            {error instanceof Error
              ? error.message
              : "No pudimos cargar las temporadas."}
          </p>

          <button
            type="button"
            className="seasonal-rates-secondary"
            onClick={() =>
              void refetch()
            }
          >
            Reintentar
          </button>
        </div>
      ) : seasonalRates?.length ? (
        <div className="seasonal-rates-list">
          {seasonalRates.map(
            (season) => (
              <article
                key={season.id}
                className="seasonal-rate-card"
              >
                <div className="seasonal-rate-card__icon">
                  <CalendarDays
                    size={18}
                    aria-hidden="true"
                  />
                </div>

                <div className="seasonal-rate-card__body">
                  <div className="seasonal-rate-card__header">
                    <div>
                      <span>
                        Temporada
                      </span>
                      <h2>
                        {season.name}
                      </h2>
                    </div>

                    <strong>
                      {formatMoney(
                        season.amountMinor,
                        season.currency,
                      )}
                    </strong>
                  </div>

                  <p>
                    {formatDate(
                      season.startDate,
                    )}
                    {" → "}
                    {formatDate(
                      season.endDate,
                    )}
                  </p>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <div className="seasonal-rates-state">
          <CalendarDays
            size={28}
            aria-hidden="true"
          />

          <h2>
            Sin temporadas
          </h2>

          <p>
            Este plan usa únicamente su tarifa base.
          </p>
        </div>
      )}
    </section>
  );
}