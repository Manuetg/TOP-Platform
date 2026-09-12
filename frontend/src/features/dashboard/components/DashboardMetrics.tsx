import { BedDouble, CalendarCheck, WalletCards, type LucideIcon } from "lucide-react";
import { reservationStatuses, type DashboardResponse } from "../types/dashboard.types";

const number = new Intl.NumberFormat("es-PY");
const percent = new Intl.NumberFormat("es-PY", { style: "percent", maximumFractionDigits: 2 });
export const occupancyLabel = (rate: number | null) => rate === null ? "—" : percent.format(rate / 10000);
export const revenueLabel = ({ currency, amountMinor }: DashboardResponse["revenue"]) =>
  currency === "PYG" ? `₲ ${number.format(amountMinor)}` : `${currency} ${number.format(amountMinor)}`;

function MetricCard({ title, value, detail, icon: Icon, tone }: {
  title: string; value: string; detail: string; icon: LucideIcon; tone: string;
}) {
  return <article className={`dashboard-card dashboard-metric dashboard-metric--${tone}`} aria-label={title}>
    <div className="dashboard-metric__heading"><h2>{title}</h2><span className="dashboard-metric__icon"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span></div>
    <strong className="dashboard-metric__value">{value}</strong>
    <p>{detail}</p>
  </article>;
}

export function DashboardMetrics({ data }: { data: DashboardResponse }) {
  const { occupancy, revenue, reservations } = data;
  return <div className="dashboard-metrics">
    <MetricCard title="Ocupación" value={occupancyLabel(occupancy.occupancyRateBasisPoints)}
      detail={occupancy.occupancyRateBasisPoints === null ? "Sin inventario vendible" : `${number.format(occupancy.occupiedResourceNights)} de ${number.format(occupancy.sellableResourceNights)} noches recurso ocupadas`}
      icon={BedDouble} tone="occupancy" />
    <MetricCard title="Ingresos registrados" value={revenueLabel(revenue)} detail="Pagos registrados en el período" icon={WalletCards} tone="revenue" />
    <MetricCard title="Reservas creadas" value={number.format(reservations.total)} detail="Creadas durante el período" icon={CalendarCheck} tone="reservations" />
  </div>;
}

export function OccupancyOverview({ occupancy }: { occupancy: DashboardResponse["occupancy"] }) {
  const rate = occupancy.occupancyRateBasisPoints;
  return <section className="dashboard-card dashboard-panel" aria-labelledby="occupancy-heading">
    <header><h2 id="occupancy-heading">Ocupación del período</h2><p>Sobre el inventario activo actual</p></header>
    <div className="dashboard-gauge">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="dashboard-gauge__track" cx="100" cy="100" r="82" fill="none" strokeWidth="12" />
        {rate !== null && rate > 0 && <circle className="dashboard-gauge__progress" cx="100" cy="100" r="82" fill="none" strokeWidth="12" pathLength="100" strokeDasharray={`${rate / 100} 100`} transform="rotate(-90 100 100)" />}
      </svg>
      <div><strong>{occupancyLabel(rate)}</strong><span>{rate === null ? "Sin inventario vendible" : "Ocupación"}</span></div>
    </div>
    <dl className="dashboard-occupancy-counts">
      <div><dt>Noches ocupadas</dt><dd>{number.format(occupancy.occupiedResourceNights)}</dd></div>
      <div><dt>Noches vendibles</dt><dd>{number.format(occupancy.sellableResourceNights)}</dd></div>
    </dl>
  </section>;
}

const labels = { DRAFT: "Borrador", PENDING: "Pendiente", CONFIRMED: "Confirmada", IN_PROGRESS: "En curso", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No show" };
export function ReservationsBreakdown({ reservations }: { reservations: DashboardResponse["reservations"] }) {
  return <section className="dashboard-card dashboard-panel" aria-labelledby="reservations-heading">
    <header><h2 id="reservations-heading">Reservas por estado</h2><p>{number.format(reservations.total)} reservas creadas en el período · Estado actual</p></header>
    <ul className="dashboard-statuses">
      {reservationStatuses.map((status) => <li key={status} className={`dashboard-status dashboard-status--${status}`}>
        <span className="dashboard-status__label">{labels[status]}</span>
        <div className="dashboard-status__track" aria-hidden="true"><span style={{ width: `${reservations.total ? reservations.byStatus[status] / reservations.total * 100 : 0}%` }} /></div>
        <strong>{number.format(reservations.byStatus[status])}</strong>
      </li>)}
    </ul>
  </section>;
}
