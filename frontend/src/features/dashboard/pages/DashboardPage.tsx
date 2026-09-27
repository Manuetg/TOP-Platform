import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { Button } from "../../../shared/ui/Button";
import { ApiError } from "../../../shared/api/api-client";
import { useResources } from "../../resources/queries/use-resources";
import { useResourceImageCovers } from "../../resources/queries/use-resource-image-covers";
import { useRatePlans } from "../../pricing/queries/use-rate-plans";
import { useDashboard } from "../queries/use-dashboard";
import { dashboardMonthToPeriod, formatDashboardMonth, initialDashboardMonth } from "../period";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardKpiStrip } from "../components/DashboardKpiStrip";
import { DashboardHospitalityIntelligence } from "../components/DashboardHospitalityIntelligence";
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
  const timezone = businessContext.activeBusiness?.timezone ?? "America/Asuncion";
  const [month, setMonth] = useState(() => initialDashboardMonth(timezone));
  const currentMonth = initialDashboardMonth(timezone);
  useEffect(() => {
    setMonth((selected) => businessContext.activeBusiness?.id === businessId ? selected : initialDashboardMonth(timezone));
  }, [businessContext.activeBusiness?.id, businessId, timezone]);
  const period = dashboardMonthToPeriod(month);
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
  return (
    <div className="dashboard-page dashboard-reference">
      <DashboardHeader business={businessContext.activeBusiness} displayName={session?.user?.displayName} month={month} currentMonth={currentMonth} onMonthChange={setMonth} />
      {!businessId ? (
        <div className="top-surface dashboard-card dashboard-message" role="status">
          No hay un negocio activo para consultar el resumen.
          durante el desarrollo.
        </div>
      ) : !session ? (
        <div className="top-surface dashboard-card dashboard-message" role="status">
          <h2>Inicia sesión para ver el resumen.</h2>
          <Link to="/login">Ir a iniciar sesión</Link>
        </div>
      ) : (
        <div className="dashboard-reference-grid">
          <DashboardKpiStrip dashboard={query.isFetching || query.isError ? undefined : data} />
          {data && !query.isFetching && !query.isError ? <DashboardHospitalityIntelligence dashboard={data} month={month} /> : null}
          <section
            className="dashboard-secondary"
            aria-label="Estado del período"
            data-source="REAL"
          >
            {query.isError ? (
              <div className="top-surface dashboard-card dashboard-message" role="alert">
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
                    <div className="top-surface dashboard-card dashboard-panel" key={key}>
                      <span />
                      <div className="dashboard-loading__body" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dashboard-results">
                <p className="dashboard-applied-period">
                  Mostrando el resumen de <strong>{formatDashboardMonth(month)}</strong>.
                </p>
                {empty && (
                  <div className="dashboard-empty" role="status">
                    <strong>Aún no hay actividad en {formatDashboardMonth(month)}.</strong>
                    <span>Prueba seleccionando otro mes.</span>
                  </div>
                )}
              </div>
            )}
          </section>
          <section className="top-surface dashboard-catalog-group dashboard-catalog-grid" aria-label="Catálogos operativos">
            <ResourcesPreview
              resources={resources.data}
              covers={covers.data}
              loading={resourceState.loading}
              error={resourceState.error}
              summary={resources.data ? `${resources.data.filter((resource) => resource.status === "ACTIVE").length} de ${resources.data.length} activos` : undefined}
              onRetry={() => void resources.refetch()}
            />
            <PricingPreview
              plans={plans.data}
              loading={planState.loading}
              error={planState.error}
              summary={plans.data ? `${plans.data.filter((plan) => plan.status === "ACTIVE").length} activas` : undefined}
              onRetry={() => void plans.refetch()}
            />
          </section>
        </div>
      )}
    </div>
  );
}
