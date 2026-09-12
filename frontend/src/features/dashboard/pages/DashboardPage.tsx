import { useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { Button } from "../../../shared/ui/Button";
import { ApiError } from "../../../shared/api/api-client";
import { useDashboard } from "../queries/use-dashboard";
import { initialDashboardPeriod } from "../period";
import { DashboardPeriodFilter } from "../components/DashboardPeriodFilter";
import { DashboardMetrics, OccupancyOverview, ReservationsBreakdown } from "../components/DashboardMetrics";
import "./DashboardPage.css";

const TEMP_BUSINESS_ID = import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function DashboardLoading() {
  return <div role="status" aria-label="Cargando resumen" className="dashboard-loading">
    <div className="dashboard-metrics" aria-hidden="true">{[0, 1, 2].map((key) => <div className="dashboard-card dashboard-metric" key={key}><span /><strong /><span /></div>)}</div>
    <div className="dashboard-panels" aria-hidden="true">{[0, 1].map((key) => <div className="dashboard-card dashboard-panel" key={key}><span /><div className="dashboard-loading__body" /></div>)}</div>
  </div>;
}

export function DashboardPage({ businessId = TEMP_BUSINESS_ID }: { businessId?: string }) {
  const { session } = useAuth();
  const [period, setPeriod] = useState(initialDashboardPeriod);
  const query = useDashboard({ businessId, ...period, accessToken: session?.accessToken });
  const data = query.data;
  const empty = data && data.occupancy.sellableResourceNights === 0 && data.occupancy.occupiedResourceNights === 0 && data.revenue.amountMinor === 0 && data.reservations.total === 0;
  return <div className="dashboard-page">
    <header className="dashboard-header">
      <div><h1>Resumen</h1><p>Una vista rápida del rendimiento de tu negocio.</p></div>
      <Link className="top-button top-button--secondary dashboard-bookings-link" to="/app/bookings"><CalendarDays size={18} aria-hidden="true" />Ver reservas</Link>
    </header>
    <section className="dashboard-toolbar" aria-label="Seleccionar período">
      <div className="dashboard-toolbar__title"><CalendarDays size={20} aria-hidden="true" /><span>Período del resumen</span></div>
      <DashboardPeriodFilter period={period} onApply={(next) => {
        if (next.from === period.from && next.to === period.to) { void query.refetch(); }
        else setPeriod(next);
      }} />
    </section>
    {!businessId ? <div className="dashboard-card dashboard-message" role="status">Configura VITE_DEV_BUSINESS_ID para consultar el resumen del negocio durante el desarrollo.</div>
      : !session ? <div className="dashboard-card dashboard-message" role="status"><h2>Inicia sesión para ver el resumen.</h2><Link to="/login">Ir a iniciar sesión</Link></div>
      : query.isError ? <div className="dashboard-card dashboard-message" role="alert"><AlertCircle size={28} aria-hidden="true" /><h2>No pudimos cargar el resumen.</h2>
        <p>{query.error instanceof ApiError && query.error.status === 403 ? "No tienes permiso para consultar este negocio." : query.error instanceof ApiError && query.error.status === 401 ? "Tu sesión ya no es válida. Inicia sesión nuevamente." : "Revisa tu conexión y el período seleccionado e intenta de nuevo."}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}><RefreshCw size={16} aria-hidden="true" />Reintentar</Button></div>
      : query.isFetching || !data ? <DashboardLoading />
      : <div className="dashboard-results">
        <p className="dashboard-applied-period">Mostrando del <time dateTime={period.from}>{period.from}</time> al <time dateTime={period.to}>{period.to}</time> (hasta no incluido)</p>
        {empty && <div className="dashboard-empty" role="status"><strong>Aún no hay actividad para este período.</strong><span>Prueba seleccionando otro rango de fechas.</span></div>}
        <DashboardMetrics data={data} />
        <div className="dashboard-panels"><OccupancyOverview occupancy={data.occupancy} /><ReservationsBreakdown reservations={data.reservations} /></div>
      </div>}
  </div>;
}
