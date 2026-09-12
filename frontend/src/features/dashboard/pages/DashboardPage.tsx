import { useState } from "react";
import { AlertCircle, CalendarDays, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { Button } from "../../../shared/ui/Button";
import { ApiError } from "../../../shared/api/api-client";
import { useResources } from "../../resources/queries/use-resources";
import { useResourceImageCovers } from "../../resources/queries/use-resource-image-covers";
import { useRatePlans } from "../../pricing/queries/use-rate-plans";
import { useDashboard } from "../queries/use-dashboard";
import { initialDashboardPeriod } from "../period";
import { DashboardPeriodFilter } from "../components/DashboardPeriodFilter";
import {
  OccupancyOverview,
  ReservationsBreakdown,
} from "../components/DashboardMetrics";
import { DashboardOverviewCards } from "../components/DashboardOverviewCards";
import {
  PricingPreview,
  ResourcesPreview,
} from "../components/DashboardCatalogs";
import "./DashboardPage.css";


export function DashboardPage({
  businessId,
}: {
  businessId?: string;
}) {
  const { session } = useAuth();
  const businessContext = useBusinessContext();
  businessId = businessId ?? businessContext.activeBusinessId;
  const [period, setPeriod] = useState(initialDashboardPeriod);
  // Reutilizar las queries de catálogo sin requests anónimos cuando falta sesión.
  const catalogInput = {
    businessId: session ? businessId : "",
    accessToken: session?.accessToken,
  };
  const resources = useResources(catalogInput);
  const covers = useResourceImageCovers(catalogInput);
  const plans = useRatePlans(catalogInput);
  const query = useDashboard({
    businessId,
    ...period,
    accessToken: session?.accessToken,
  });
  const data = query.data;
  const empty =
    data &&
    data.occupancy.sellableResourceNights === 0 &&
    data.occupancy.occupiedResourceNights === 0 &&
    data.revenue.amountMinor === 0 &&
    data.reservations.total === 0;
  const resourceState = {
    loading: resources.isLoading || !resources.data,
    error: resources.isError,
  };
  const planState = {
    loading: plans.isLoading || !plans.data,
    error: plans.isError,
  };
  const dashboardState = {
    loading: query.isFetching || !data,
    error: query.isError,
  };
  return (
    <div className="dashboard-page dashboard-reference">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Gestiona tu alojamiento desde un solo lugar.</p>
        </div>
        <div className="dashboard-header-actions">
          <Link
            className="top-button top-button--primary"
            to="/app/resources/new"
          >
            <Plus size={18} aria-hidden="true" />
            Crear recurso
          </Link>
          <Link className="top-button top-button--secondary" to="/app/bookings">
            <CalendarDays size={18} aria-hidden="true" />
            Ver reservas
          </Link>
        </div>
      </header>
      <section className="dashboard-toolbar" aria-label="Seleccionar período">
        <div className="dashboard-toolbar__title">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <span>Período del resumen</span>
            <small>Ingresos, ocupación y reservas creadas</small>
          </div>
        </div>
        <DashboardPeriodFilter
          period={period}
          onApply={(next) => {
            if (!businessId || !session?.accessToken) return;
            if (next.from === period.from && next.to === period.to) {
              void query.refetch();
            } else setPeriod(next);
          }}
        />
      </section>
      {!businessId ? (
        <div className="dashboard-card dashboard-message" role="status">
          Configura VITE_DEV_BUSINESS_ID para consultar el resumen del negocio
          durante el desarrollo.
        </div>
      ) : !session ? (
        <div className="dashboard-card dashboard-message" role="status">
          <h2>Inicia sesión para ver el resumen.</h2>
          <Link to="/login">Ir a iniciar sesión</Link>
        </div>
      ) : (
        <div className="dashboard-reference-grid">
          <DashboardOverviewCards
            resources={resources.data}
            plans={plans.data}
            dashboard={data}
            resourceState={resourceState}
            planState={planState}
            dashboardState={dashboardState}
          />
          <ResourcesPreview
            resources={resources.data}
            covers={covers.data}
            loading={resourceState.loading}
            error={resourceState.error}
            onRetry={() => void resources.refetch()}
          />
          <PricingPreview
            plans={plans.data}
            loading={planState.loading}
            error={planState.error}
            onRetry={() => void plans.refetch()}
          />
          <section
            className="dashboard-secondary"
            aria-label="Ocupación y reservas del período"
            data-source="REAL"
          >
            {query.isError ? (
              <div className="dashboard-card dashboard-message" role="alert">
                <AlertCircle size={24} aria-hidden="true" />
                <h2>No pudimos cargar el resumen.</h2>
                <p>
                  {query.error instanceof ApiError && query.error.status === 403
                    ? "No tienes permiso para consultar este negocio."
                    : query.error instanceof ApiError &&
                        query.error.status === 401
                      ? "Tu sesión ya no es válida. Inicia sesión nuevamente."
                      : "Revisa tu conexión y el período seleccionado e intenta de nuevo."}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : query.isFetching || !data ? (
              <div
                className="dashboard-loading"
                role="status"
                aria-label="Cargando resumen"
              >
                <div className="dashboard-panels" aria-hidden="true">
                  {[0, 1].map((key) => (
                    <div className="dashboard-card dashboard-panel" key={key}>
                      <span />
                      <div className="dashboard-loading__body" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dashboard-results">
                <p className="dashboard-applied-period">
                  Mostrando del{" "}
                  <time dateTime={period.from}>{period.from}</time> al{" "}
                  <time dateTime={period.to}>{period.to}</time> (hasta no
                  incluido)
                </p>
                {empty && (
                  <div className="dashboard-empty" role="status">
                    <strong>Aún no hay actividad para este período.</strong>
                    <span>Prueba seleccionando otro rango de fechas.</span>
                  </div>
                )}
                <div className="dashboard-panels">
                  <OccupancyOverview occupancy={data.occupancy} />
                  <ReservationsBreakdown reservations={data.reservations} />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
