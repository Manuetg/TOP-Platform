import {
  BadgeDollarSign,
  CalendarRange,
  Layers3,
  Search,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { PricingResourcePill } from "../components/PricingResourcePill";
import { useRatePlans } from "../queries/use-rate-plans";
import type {
  RatePlan,
  RatePlanStatus,
} from "../types/pricing.types";
import "./RatePlanListPage.css";

interface RatePlanListPageProps {
  businessId?: string;
}

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

const STATUS_LABELS: Record<
  RatePlanStatus,
  string
> = {
  ACTIVE: "Activo",
  ARCHIVED: "Archivado",
};

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

function formatDate(value: string | null) {
  if (!value) {
    return "Sin límite";
  }

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

function matchesSearch(
  plan: RatePlan,
  search: string,
) {
  const normalized = search
    .trim()
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  const haystack = [
    plan.name,
    plan.description ?? "",
    plan.currency,
    ...plan.resources.map(
      (resource) => resource.name,
    ),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function RatePlanListPage({
  businessId = TEMP_BUSINESS_ID,
}: RatePlanListPageProps) {
  const { session } = useAuth();

  const [search, setSearch] =
    useState("");
  const [status, setStatus] =
    useState<"ALL" | RatePlanStatus>("ALL");
  const [filtersOpen, setFiltersOpen] =
    useState(false);
  const ratePlanDeckRef =
    useRef<HTMLDivElement | null>(null);

  const [
    activeRatePlanIndex,
    setActiveRatePlanIndex,
  ] = useState(0);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (status !== "ALL" ? 1 : 0);

  const {
    data: ratePlans,
    isLoading,
    isError,
    error,
    refetch,
  } = useRatePlans({
    businessId,
    accessToken: session?.accessToken,
  });

  const filteredPlans = useMemo(
    () =>
      (ratePlans ?? []).filter(
        (plan) =>
          matchesSearch(plan, search) &&
          (status === "ALL" ||
            plan.status === status),
      ),
    [
      ratePlans,
      search,
      status,
    ],
  );

  
  useEffect(() => {
    const deck = ratePlanDeckRef.current;

    if (!deck) {
      return;
    }

    const updateActiveRatePlan = () => {
      if (window.innerWidth >= 768) {
        return;
      }

      const cards = Array.from(
        deck.querySelectorAll<HTMLElement>(
          ".rate-plan-deck-item",
        ),
      );

      if (cards.length === 0) {
        return;
      }

      const deckRect =
        deck.getBoundingClientRect();

      const deckCenter =
        deckRect.left +
        deckRect.width / 2;

      let closestIndex = 0;
      let closestDistance =
        Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardRect =
          card.getBoundingClientRect();

        const cardCenter =
          cardRect.left +
          cardRect.width / 2;

        const distance = Math.abs(
          deckCenter - cardCenter,
        );

        if (
          distance < closestDistance
        ) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveRatePlanIndex(
        closestIndex,
      );
    };

    updateActiveRatePlan();

    deck.addEventListener(
      "scroll",
      updateActiveRatePlan,
      { passive: true },
    );

    window.addEventListener(
      "resize",
      updateActiveRatePlan,
    );

    return () => {
      deck.removeEventListener(
        "scroll",
        updateActiveRatePlan,
      );

      window.removeEventListener(
        "resize",
        updateActiveRatePlan,
      );
    };
  }, [filteredPlans.length]);
  useEffect(() => {
    const deck = ratePlanDeckRef.current;

    if (!deck) {
      return;
    }

    const syncRatePlanCardHeights = () => {
      const cards = Array.from(
        deck.querySelectorAll<HTMLElement>(
          ".rate-plan-card",
        ),
      );

      if (cards.length === 0) {
        return;
      }

      // Desktop vuelve a depender únicamente del grid.
      if (window.innerWidth >= 768) {
        cards.forEach((card) => {
          card.style.height = "";
        });

        return;
      }

      // Reset antes de medir para obtener la altura
      // natural real de cada card.
      cards.forEach((card) => {
        card.style.height = "auto";
      });

      const maxHeight = Math.max(
        ...cards.map(
          (card) =>
            card.getBoundingClientRect().height,
        ),
      );

      cards.forEach((card) => {
        card.style.height =
          `${Math.ceil(maxHeight)}px`;
      });
    };

    syncRatePlanCardHeights();

    const frameId = window.requestAnimationFrame(
      syncRatePlanCardHeights,
    );

    window.addEventListener(
      "resize",
      syncRatePlanCardHeights,
    );

    return () => {
      window.cancelAnimationFrame(frameId);

      window.removeEventListener(
        "resize",
        syncRatePlanCardHeights,
      );
    };
  }, [filteredPlans]);

if (isLoading) {
    return (
      <section
        className="rate-plan-page"
        aria-busy="true"
      >
        <div className="rate-plan-state">
          <div
            className="rate-plan-state__icon"
            aria-hidden="true"
          >
            <BadgeDollarSign size={28} />
          </div>

          <h1>Cargando precios</h1>
          <p>
            Estamos preparando los planes
            tarifarios del Business.
          </p>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rate-plan-page">
        <div
          className="rate-plan-state"
          role="alert"
        >
          <div
            className="rate-plan-state__icon"
            aria-hidden="true"
          >
            <BadgeDollarSign size={28} />
          </div>

          <h1>
            No pudimos cargar los planes
          </h1>

          <p>
            {error instanceof Error
              ? error.message
              : "Los planes tarifarios no están disponibles."}
          </p>

          <button
            type="button"
            className="rate-plan-retry"
            onClick={() =>
              void refetch()
            }
          >
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rate-plan-page">
      <header className="rate-plan-header">
        <div>
          <span className="rate-plan-eyebrow">
            Pricing
          </span>

          <h1>Planes tarifarios</h1>

          <p>
            Configuración base de precios para
            los alojamientos.
          </p>
        </div>
        <Link
          to="/app/pricing/new"
          className="rate-plan-create-button"
        >
          Crear plan
        </Link>
      </header>

      <button
        type="button"
        className="rate-plan-filter-toggle"
        aria-expanded={filtersOpen}
        aria-controls="rate-plan-filters"
        onClick={() =>
          setFiltersOpen((current) => !current)
        }
      >
        <span>
          <Search
            size={17}
            aria-hidden="true"
          />
          Buscar y filtrar
        </span>

        <small>
          {activeFilterCount > 0
            ? `${activeFilterCount} ${
                activeFilterCount === 1
                  ? "filtro activo"
                  : "filtros activos"
              }`
            : "Opciones"}
        </small>
      </button>

      <div
        id="rate-plan-filters"
        className={`rate-plan-filters ${
          filtersOpen
            ? "rate-plan-filters--open"
            : ""
        }`}
      >
        <label className="rate-plan-search">
          <span className="rate-plan-filter-label">
            Buscar planes
          </span>

          <div className="rate-plan-search__control">
            <Search
              size={17}
              aria-hidden="true"
            />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Nombre del plan o recurso"
            />
          </div>
        </label>

        <label className="rate-plan-status-filter">
          <span className="rate-plan-filter-label">
            Estado
          </span>

          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as
                  | "ALL"
                  | RatePlanStatus,
              )
            }
          >
            <option value="ALL">
              Todos
            </option>
            <option value="ACTIVE">
              Activos
            </option>
            <option value="ARCHIVED">
              Archivados
            </option>
          </select>
        </label>
      </div>

      {filteredPlans.length === 0 ? (
        <div className="rate-plan-state">
          <div
            className="rate-plan-state__icon"
            aria-hidden="true"
          >
            <Layers3 size={28} />
          </div>

          <h2>
            {ratePlans?.length
              ? "No hay resultados"
              : "Todavía no hay planes tarifarios"}
          </h2>

          <p>
            {ratePlans?.length
              ? "Probá cambiando la búsqueda o el estado."
              : "Los planes que se creen para este Business aparecerán acá."}
          </p>
        </div>
      ) : (
        <div ref={ratePlanDeckRef} className="rate-plan-grid">
          {filteredPlans.map(
            (plan, index) => (
              <div
                key={plan.id}
                className={`rate-plan-deck-item${
                  index === activeRatePlanIndex
                    ? " rate-plan-deck-item--active"
                    : ""
                }`}
              >
                <article className="rate-plan-card">
                <div className="rate-plan-card__top">
                  <div>
                    <span className="rate-plan-card__label">
                      Plan tarifario
                    </span>

                    <h2>{plan.name}</h2>
                  </div>

                  <span
                    className={`rate-plan-status rate-plan-status--${plan.status.toLowerCase()}`}
                  >
                    {
                      STATUS_LABELS[
                        plan.status
                      ]
                    }
                  </span>
                </div>

                {plan.description && (
                  <p className="rate-plan-card__description">
                    {plan.description}
                  </p>
                )}

                <div className="rate-plan-price">
                  <strong>
                    {formatMoney(
                      plan.baseNightlyAmountMinor,
                      plan.currency,
                    )}
                  </strong>
                  <span>por noche base</span>
                </div>

                <dl className="rate-plan-meta">
                  <div>
                    <dt>
                      <CalendarRange
                        size={15}
                        aria-hidden="true"
                      />
                      Vigencia
                    </dt>
                    <dd>
                      {formatDate(
                        plan.validFrom,
                      )}
                      {" → "}
                      {formatDate(
                        plan.validTo,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      <Layers3
                        size={15}
                        aria-hidden="true"
                      />
                      Recursos
                    </dt>
                    <dd>
                      {plan.resources.length ===
                      0
                        ? "Sin recursos asignados"
                        : `${plan.resources.length} asignado${
                            plan.resources
                              .length === 1
                              ? ""
                              : "s"
                          }`}
                    </dd>
                  </div>
                </dl>

                {plan.resources.length > 0 && (
                  <div className="rate-plan-resource-list">
                    {plan.resources.map(
                      (resource) => (
                        <PricingResourcePill
                          key={resource.id}
                          name={resource.name}
                        />
                      ),
                    )}
                  </div>
                )}
                {plan.status === "ACTIVE" && (
                  <div className="rate-plan-card__actions">
                    <Link
                      to={`/app/pricing/${plan.id}/preview`}
                      className="rate-plan-preview-link"
                    >
                      Calcular
                    </Link>
                    <Link
                      to={`/app/pricing/${plan.id}/seasons`}
                      className="rate-plan-seasons-link"
                    >
                      Temporadas
                    </Link>

                    <Link
                      to={`/app/pricing/${plan.id}/edit`}
                      className="rate-plan-edit-link"
                    >
                      Editar plan
                    </Link>
                  </div>
                )}
              </article>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}