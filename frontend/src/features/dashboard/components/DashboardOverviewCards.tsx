import { House, Tags, type LucideIcon } from "lucide-react";
import type { Resource } from "../../resources/types/resource.types";
import type { RatePlan } from "../../pricing/types/pricing.types";

interface MetricState {
  loading: boolean;
  error: boolean;
}
function OverviewCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
  loading,
  error,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
} & MetricState) {
  return (
    <article
      className={`top-surface dashboard-card dashboard-overview-card dashboard-overview-card--${tone}`}
      aria-label={title}
      data-source="REAL"
    >
      <span className="dashboard-overview-card__icon">
        <Icon size={23} strokeWidth={1.65} aria-hidden="true" />
      </span>
      <div>
        <h2>{title}</h2>
        {error ? (
          <p className="dashboard-kpi-error">No disponible</p>
        ) : loading ? (
          <span
            className="dashboard-kpi-skeleton"
            role="status"
            aria-label={`Cargando ${title}`}
          />
        ) : (
          <strong>{value}</strong>
        )}
        {!error && !loading && <p>{detail}</p>}
      </div>
    </article>
  );
}

export function DashboardOverviewCards({
  resources,
  plans,
  resourceState,
  planState,
}: {
  resources?: Resource[];
  plans?: RatePlan[];
  resourceState: MetricState;
  planState: MetricState;
}) {
  return (
    <div className="dashboard-overview">
      <OverviewCard
        title="Recursos activos"
        value={String(
          resources?.filter((resource) => resource.status === "ACTIVE")
            .length ?? 0,
        )}
        detail={`de ${resources?.length ?? 0} totales`}
        icon={House}
        tone="resources"
        {...resourceState}
      />
      <OverviewCard
        title="Tarifas activas"
        value={String(
          plans?.filter((plan) => plan.status === "ACTIVE").length ?? 0,
        )}
        detail={`de ${plans?.length ?? 0} totales`}
        icon={Tags}
        tone="pricing"
        {...planState}
      />
    </div>
  );
}
