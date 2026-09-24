import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BadgeDollarSign, CalendarOff, CalendarPlus, Moon, Sun, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import type { Business } from "../../business/types/business.types";
import { formatDashboardMonth } from "../period";
import { DashboardMonthFilter } from "./DashboardMonthFilter";

export function DashboardHeader({
  business,
  displayName,
  month,
  currentMonth,
  onMonthChange,
}: {
  business: Business | null;
  displayName?: string | null;
  month: string;
  currentMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timezone = business?.timezone ?? "America/Asuncion";
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0);

  const isMorning = hour >= 4 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 19;
  const isNight = !isMorning && !isAfternoon;

  const firstName = displayName?.trim().split(/\s+/)[0] || null;

  const greeting = isMorning
    ? "Buenos días"
    : isAfternoon
      ? "Buenas tardes"
      : "Buenas noches";

  const greetingText = firstName ? `${greeting}, ${firstName}` : greeting;
  const GreetingIcon = isNight ? Moon : Sun;
  return (
    <motion.header
      className="dashboard-context-header"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.28, ease: "easeOut" }}
    >
      <div className="dashboard-context-header__copy">
        <span className="dashboard-eyebrow">Resumen operativo</span>
        <h1 className="dashboard-greeting">
          <GreetingIcon
            className={`dashboard-greeting__icon dashboard-greeting__icon--${isNight ? "night" : "day"}`}
            size={30}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span>{greetingText}</span>
        </h1>
      </div>
      <div className="dashboard-context-header__actions">
        <DashboardMonthFilter month={month} currentMonth={currentMonth} onChange={onMonthChange} />
        <nav className="dashboard-quick-actions" aria-label="Acciones rápidas">
          <Link className="dashboard-quick-action" to="/app/bookings/new">
            <CalendarPlus size={16} aria-hidden="true" />
            <span>Crear reserva</span>
          </Link>

          <Link className="dashboard-quick-action" to="/app/pricing/new">
            <BadgeDollarSign size={16} aria-hidden="true" />
            <span>Crear tarifa</span>
          </Link>

          <Link className="dashboard-quick-action" to="/app/contacts/new">
            <UserPlus size={16} aria-hidden="true" />
            <span>Crear contacto</span>
          </Link>

          <Link className="dashboard-quick-action" to="/app/blocks/new">
            <CalendarOff size={16} aria-hidden="true" />
            <span>Crear bloqueo</span>
          </Link>
        </nav>
      </div>
    </motion.header>
  );
}
