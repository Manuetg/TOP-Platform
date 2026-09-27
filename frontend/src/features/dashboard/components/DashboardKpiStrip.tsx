import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CalendarCheck, ChartNoAxesCombined, CalendarRange, WalletCards, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardResponse } from "../types/dashboard.types";
import { AnimatedNumber } from "./AnimatedNumber";

function Kpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  visual,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  tone?: string;
  visual?: ReactNode;
}) {
  return (
    <article className={`dashboard-kpi ${tone ?? ""}`} aria-label={label}>
      <div className="dashboard-kpi__label"><span className="dashboard-kpi__icon"><Icon size={17} aria-hidden="true" /></span>{label}</div>
      <div className="dashboard-kpi__body">
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
      {visual ? <div className="dashboard-kpi__visual" aria-hidden="true">{visual}</div> : <div className="dashboard-kpi__visual dashboard-kpi__visual--empty" aria-hidden="true" />}
    </article>
  );
}

function OccupancyMiniChart({ dashboard, reducedMotion }: { dashboard: DashboardResponse; reducedMotion: boolean }) {
  const data = (dashboard.occupancy.daily ?? []).map((item) => ({
    date: item.date,
    occupancy: item.occupancyRateBasisPoints === null ? null : item.occupancyRateBasisPoints / 100,
  }));
  if (!data.length) return null;
  return (
    <div className="dashboard-kpi__mini-chart" role="img" aria-label="Tendencia diaria de ocupación">
      <ResponsiveContainer width="100%" height={58}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Tooltip formatter={(value) => [`${value ?? "—"}%`, "Ocupación"]} labelFormatter={(label) => String(label)} />
          <Area type="monotone" dataKey="occupancy" connectNulls={false} stroke="#155C4C" strokeWidth={2} fill="#DCEFE7" dot={false} isAnimationActive={!reducedMotion} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardKpiStrip({ dashboard }: { dashboard?: DashboardResponse }) {
  const reducedMotion = useReducedMotion() ?? false;
  const total = dashboard?.reservations.total ?? 0;
  const confirmed = dashboard?.reservations.byStatus.CONFIRMED ?? 0;
  const confirmedRate = total ? Math.round((confirmed / total) * 100) : null;
  const weekend = dashboard?.occupancy.weekends;
  const reservationSegments = dashboard
    ? Object.entries(dashboard.reservations.byStatus)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({ status, count, width: total ? `${(count / total) * 100}%` : "0%" }))
    : [];
  const items = [
    {
      label: "Ocupación",
      value: dashboard && dashboard.occupancy.occupancyRateBasisPoints !== null ? <AnimatedNumber value={dashboard.occupancy.occupancyRateBasisPoints / 100} format="percent" /> : "—",
      detail: dashboard ? `${dashboard.occupancy.occupiedResourceNights} de ${dashboard.occupancy.sellableResourceNights} noches` : "Cargando mes",
      icon: ChartNoAxesCombined,
      visual: dashboard ? <OccupancyMiniChart dashboard={dashboard} reducedMotion={reducedMotion} /> : null,
    },
    {
      label: "Fines de semana",
      value: weekend ? <><AnimatedNumber value={weekend.full} /> <em>/ {weekend.total}</em></> : "—",
      detail: weekend ? `${weekend.full} completos · ${weekend.partial} parciales` : "Sin datos del mes",
      icon: CalendarRange,
      visual: weekend?.items.length ? <div className="dashboard-weekend-segments">{weekend.items.slice(0, 6).map((item) => <span key={item.from} className={`dashboard-weekend-segment dashboard-weekend-segment--${item.status}`} title={`${item.from}–${item.to}: ${item.status}`} style={{ flex: `${Math.max(item.totalResources, 1)} 1 0` }} />)}</div> : <div className="dashboard-kpi__empty-visual" />,
    },
    {
      label: "Reservas confirmadas",
      value: dashboard ? <AnimatedNumber value={confirmed} /> : "—",
      detail: dashboard && confirmedRate !== null ? `${confirmedRate}% de ${total} reservas` : "Cargando mes",
      icon: CalendarCheck,
      visual: <div className="dashboard-status-bar">{reservationSegments.map((segment) => <i key={segment.status} className={`dashboard-status-bar__segment dashboard-status-bar__segment--${segment.status}`} style={{ width: segment.width }} title={segment.status} />)}</div>,
    },
    {
      label: "Ingresos",
      value: dashboard ? <AnimatedNumber value={dashboard.revenue.amountMinor} format="currency" currency={dashboard.revenue.currency} /> : "—",
      detail: dashboard ? "Monto del mes" : "Cargando mes",
      icon: WalletCards,
    },
  ];
  return (
    <motion.section
      className="dashboard-kpi-strip top-surface"
      aria-label="Indicadores principales del mes"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : 0.06, ease: "easeOut" }}
    >
      {items.map((item, index) => <Kpi key={item.label} {...item} tone={`tone-${index + 1}`} />)}
    </motion.section>
  );
}
