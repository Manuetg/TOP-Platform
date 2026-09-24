import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarRange, CircleAlert, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse } from "../types/dashboard.types";
import { formatDashboardMonth } from "../period";
import { occupancyLabel } from "./DashboardMetrics";

const labels: Record<string, string> = { DRAFT: "Borrador", PENDING: "Pendiente", CONFIRMED: "Confirmada", IN_PROGRESS: "En curso", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No show" };
const statusColors: Record<string, string> = { DRAFT: "#A7B5B1", PENDING: "#C99728", CONFIRMED: "#155C4C", IN_PROGRESS: "#3288A0", COMPLETED: "#2E8B67", CANCELLED: "#B85C38", NO_SHOW: "#6F7F83" };
function percentage(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }

function ReservationHealth({ dashboard, month }: { dashboard: DashboardResponse; month: string }) {
  const total = dashboard.reservations.total;
  const statuses = Object.entries(dashboard.reservations.byStatus);
  const chartData = total ? statuses.map(([status, count]) => ({ status, count })) : [{ status: "EMPTY", count: 1 }];
  const confirmed = dashboard.reservations.byStatus.CONFIRMED;
  return <article role="region" className="dashboard-intelligence-panel dashboard-health" aria-label="Reservas por estado"><header><div><span className="dashboard-eyebrow">Reservas</span><h2 id="dashboard-health-title">Salud de reservas</h2><p>Reservas creadas en {formatDashboardMonth(month)}</p></div><span className="dashboard-panel-tag">{total ? `${percentage(confirmed, total)}% confirmadas` : "Sin actividad"}</span></header><div className="dashboard-health__body"><div className="dashboard-health__chart" role="img" aria-label={`${total} reservas distribuidas por estado`}><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={chartData} dataKey="count" nameKey="status" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none" isAnimationActive>{chartData.map((entry) => <Cell key={entry.status} fill={statusColors[entry.status] ?? "#E8EEEC"} />)}</Pie><Tooltip formatter={(value, name) => [`${value ?? 0}`, labels[String(name)] ?? String(name)]} /></PieChart></ResponsiveContainer><div className="dashboard-health__chart-label"><strong>{total}</strong><span>reservas</span></div></div><ul className="dashboard-health__list">{statuses.map(([status, count]) => <li key={status}><span className={`dashboard-health__dot dashboard-health__dot--${status}`} /><span>{labels[status] ?? status}</span><strong>{count}</strong><small>{total ? `${percentage(count, total)}%` : "—"}</small></li>)}</ul></div></article>;
}

function DailyOccupancyPerformance({ dashboard, month }: { dashboard: DashboardResponse; month: string }) {
  const daily = dashboard.occupancy.daily ?? [];
  const chartData = daily.map((item) => ({ ...item, occupancy: item.occupancyRateBasisPoints === null ? null : item.occupancyRateBasisPoints / 100, label: new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${item.date}T00:00:00Z`)) }));
  const weekendRange = chartData.filter((item) => [5, 6].includes(new Date(`${item.date}T00:00:00Z`).getUTCDay()));
  const weekendStart = weekendRange[0]?.label;
  const weekendEnd = weekendRange.at(-1)?.label;
  const footer = [["Fin de semana", dashboard.occupancy.weekend?.occupancyRateBasisPoints, "percent"], ["Entre semana", dashboard.occupancy.weekday?.occupancyRateBasisPoints, "percent"], ["Noches ocupadas", dashboard.occupancy.occupiedResourceNights, "number"], ["Fines con disponibilidad", dashboard.occupancy.weekends?.available ?? 0, "number"]] as const;
  return <article className="dashboard-intelligence-panel dashboard-occupancy-performance" aria-labelledby="dashboard-occupancy-performance-title"><header><div><span className="dashboard-eyebrow">Rendimiento</span><h2 id="dashboard-occupancy-performance-title">Ocupación diaria</h2><p>{formatDashboardMonth(month)}</p></div><TrendingUp size={19} aria-hidden="true" /></header>{chartData.length === 0 ? <p className="dashboard-panel-state">No hay datos diarios para este mes.</p> : <><div className="dashboard-occupancy-chart" role="img" aria-label="Ocupación diaria en porcentaje"><ResponsiveContainer width="100%" height={260}><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E1E9E6" strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: "#6F7F83", fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: "#6F7F83", fontSize: 11 }} />{weekendStart && weekendEnd ? <ReferenceArea x1={weekendStart} x2={weekendEnd} fill="#B85C38" fillOpacity={0.045} /> : null}<Tooltip formatter={(value) => [value === null ? "Sin inventario" : `${value}%`, "Ocupación"]} labelFormatter={(label) => `Noche del ${label}`} /><Area type="monotone" dataKey="occupancy" connectNulls={false} stroke="#155C4C" strokeWidth={2.5} fill="#EAF5F0" dot={{ r: 2.5, fill: "#155C4C", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#B85C38", stroke: "#fff", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div><div className="dashboard-occupancy-footer" aria-label="Resumen de ocupación">{footer.map(([label, value, format]) => <div key={label}><span>{label}</span><strong>{value === null || value === undefined ? "—" : format === "percent" ? occupancyLabel(value) : value}</strong></div>)}</div></>}</article>;
}

function WeekendAvailability({ dashboard, month }: { dashboard: DashboardResponse; month: string }) {
  const weekends = dashboard.occupancy.weekends?.items ?? [];

  return (
    <article
      className="dashboard-intelligence-panel dashboard-weekend-panel"
      aria-labelledby="dashboard-weekend-title"
    >
      <header>
        <div>
          <span className="dashboard-eyebrow">Disponibilidad</span>
          <h2 id="dashboard-weekend-title">
            Fines de semana de {formatDashboardMonth(month)}
          </h2>
          <p>
            {weekends.length
              ? `${weekends.length} períodos observados`
              : "Sin fines de semana en este mes"}
          </p>
        </div>
        <CalendarRange size={19} aria-hidden="true" />
      </header>

      {weekends.length === 0 ? (
        <p className="dashboard-panel-state">
          Sin fines de semana en este mes.
        </p>
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-data-table">
            <caption className="dashboard-sr-only">
              Disponibilidad de fines de semana de {formatDashboardMonth(month)}
            </caption>

            <thead>
              <tr>
                <th scope="col">Fin de semana</th>
                <th scope="col">Disponibilidad</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>

            <tbody>
              {weekends.slice(0, 6).map((item) => (
                <tr key={item.from}>
                  <td>
                    <strong>{item.from}</strong>
                    <small>→ {item.to}</small>
                  </td>

                  <td>
                    <span className="dashboard-weekend-availability">
                      <strong>{item.availableResources}</strong>
                      <span>de {item.totalResources} recursos</span>
                    </span>
                  </td>

                  <td>
                    <span
                      className={`dashboard-weekend-status dashboard-weekend-status--${item.status}`}
                    >
                      {item.status === "FULL"
                        ? "Completo"
                        : item.status === "AVAILABLE"
                          ? "Disponible"
                          : "Parcial"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function Opportunities({ dashboard }: { dashboard: DashboardResponse }) {
  const opportunities = dashboard.occupancy.weekends?.available ? [{ title: "Fin de semana con disponibilidad", text: `${dashboard.occupancy.weekends.available} período(s) todavía tienen recursos disponibles.`, href: "/app/availability/calendar" }] : dashboard.reservations.byStatus.CANCELLED > 0 ? [{ title: "Cancelaciones del mes", text: `${dashboard.reservations.byStatus.CANCELLED} de ${dashboard.reservations.total} reservas fueron canceladas.`, href: "/app/bookings" }] : [];
  return <article className="dashboard-intelligence-panel dashboard-opportunities" aria-labelledby="dashboard-opportunities-title"><header><div><span className="dashboard-eyebrow">Siguiente mirada</span><h2 id="dashboard-opportunities-title">Oportunidades</h2></div><CircleAlert size={19} aria-hidden="true" /></header>{opportunities.length === 0 ? <div className="dashboard-insight dashboard-insight--quiet"><strong>Sin alertas importantes</strong><p>No hay oportunidades operativas destacadas para este mes.</p></div> : opportunities.map((item) => <div className="dashboard-insight" key={item.title}><strong>{item.title}</strong><p>{item.text}</p><Link to={item.href}>Abrir <ArrowRight size={15} aria-hidden="true" /></Link></div>)}</article>;
}

export function DashboardHospitalityIntelligence({ dashboard, month }: { dashboard: DashboardResponse; month: string }) {
  const reducedMotion = useReducedMotion() ?? false;
  const transition = { duration: reducedMotion ? 0 : 0.28, ease: "easeOut" as const };
  return <div className="dashboard-intelligence-stack"><motion.section className="top-surface dashboard-intelligence-group dashboard-intelligence-grid" initial={false} animate={{ opacity: 1, y: 0 }} transition={transition}><DailyOccupancyPerformance dashboard={dashboard} month={month} /><ReservationHealth dashboard={dashboard} month={month} /></motion.section><motion.section className="top-surface dashboard-intelligence-group dashboard-operational-grid" initial={false} animate={{ opacity: 1, y: 0 }} transition={{ ...transition, delay: reducedMotion ? 0 : 0.06 }}><WeekendAvailability dashboard={dashboard} month={month} /><Opportunities dashboard={dashboard} /></motion.section></div>;
}
