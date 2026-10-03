import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, CircleSlash } from "lucide-react";
import { useBookings } from "../../bookings/queries/use-bookings";
import type { Booking } from "../../bookings/types/booking.types";
import { bookingStatusLabels } from "../../bookings/booking-status";
import { useBlocks } from "../../blocks/queries/use-blocks";
import type { Block, EffectiveBlockStatus } from "../../blocks/types/block.types";
import { Button } from "../../../shared/ui/Button";
import { addCalendarDays, businessDateAt, businessDayStartInstant, businessDayInstantRange, instantIntersectsRange } from "../../../shared/utils/business-date";
import { formatBusinessInstant, formatPureDate } from "../../../shared/utils/date-format";
import "./ResourceAvailabilityCalendar.css";

interface ResourceAvailabilityCalendarProps {
  businessId: string;
  resourceId: string;
  resourceName?: string;
  timezone: string;
  accessToken?: string | null;
}

const blockStatusLabels: Record<EffectiveBlockStatus, string> = {
  SCHEDULED: "Programado", ACTIVE: "Activo", FINISHED: "Finalizado", CANCELLED: "Cancelado",
};

function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function monthDays(start: string) {
  const [year, month] = start.slice(0, 7).split("-").map(Number);
  return Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) => addCalendarDays(start, index));
}
function bookingIntersectsDay(booking: Booking, day: string) {
  return Boolean(booking.checkInDate && booking.checkOutDate && booking.checkInDate <= day && day < booking.checkOutDate);
}
function blockIntersectsDay(block: Block, day: string, timezone: string) {
  return instantIntersectsRange(block.startsAt, block.endsAt, businessDayInstantRange(day, timezone));
}
function getMonthLabel(start: string) {
  return new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00.000Z`));
}

// El período seleccionado pertenece al recurso y a la timezone del negocio.
export function ResourceAvailabilityCalendar(props: ResourceAvailabilityCalendarProps) {
  return <ResourceAgenda key={`${props.businessId}:${props.resourceId}:${props.timezone}`} {...props} />;
}

function ResourceAgenda({ businessId, resourceId, resourceName, timezone, accessToken }: ResourceAvailabilityCalendarProps) {
  const titleId = useId();
  const dayTitleId = useId();
  const dayListId = useId();
  const today = businessDateAt(new Date(), timezone);
  const [month, setMonth] = useState(() => monthStart(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInProgress = useRef(false);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const days = useMemo(() => monthDays(month), [month]);
  const nextMonth = addCalendarDays(month, days.length);
  const firstWeekday = (new Date(`${month}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const cells = useMemo(() => [
    ...Array.from({ length: firstWeekday }, () => null), ...days,
    ...Array.from({ length: (7 - ((firstWeekday + days.length) % 7)) % 7 }, () => null),
  ], [days, firstWeekday]);

  const bookingsQuery = useBookings({ businessId, resourceId, accessToken });
  const blocksQuery = useBlocks({ businessId, resourceId, from: businessDayStartInstant(month, timezone), to: businessDayStartInstant(nextMonth, timezone), accessToken });
  // La agenda conserva movimientos; no calcula disponibilidad ni ocupación.
  const monthBookings = useMemo(() => (bookingsQuery.data ?? []).filter((booking) =>
    !["CANCELLED", "NO_SHOW"].includes(booking.status) && Boolean(booking.checkInDate && booking.checkOutDate) &&
    booking.checkInDate! < nextMonth && booking.checkOutDate! > month,
  ), [bookingsQuery.data, month, nextMonth]);
  const blocks = useMemo(() => (blocksQuery.data ?? []).filter((block) =>
    block.effectiveStatus !== "CANCELLED" && instantIntersectsRange(block.startsAt, block.endsAt, {
      start: businessDayStartInstant(month, timezone), end: businessDayStartInstant(nextMonth, timezone),
    }),
  ), [blocksQuery.data, month, nextMonth, timezone]);
  const movementsByDay = useMemo(() => new Map(days.map((day) => [day, {
    bookings: monthBookings.filter((booking) => bookingIntersectsDay(booking, day)),
    blocks: blocks.filter((block) => blockIntersectsDay(block, day, timezone)),
  }])), [days, monthBookings, blocks, timezone]);
  const selectedMovements = movementsByDay.get(selectedDay);
  const isLoading = bookingsQuery.isLoading || blocksQuery.isLoading;
  const hasError = bookingsQuery.isError || blocksQuery.isError;

  function shiftMonth(delta: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    const start = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`;
    setMonth(start);
    setSelectedDay(start);
  }
  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const index = days.indexOf(day);
    const weekday = (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const nextDay = days[Math.max(0, Math.min(days.length - 1, index + offset))];
    setSelectedDay(nextDay);
    dayButtons.current.get(nextDay)?.focus();
  }
  async function retryAgenda() {
    if (retryInProgress.current) return;
    retryInProgress.current = true;
    setIsRetrying(true);
    try { await Promise.allSettled([bookingsQuery.refetch(), blocksQuery.refetch()]); }
    finally { retryInProgress.current = false; setIsRetrying(false); }
  }

  return (
    <section className="resource-calendar" aria-labelledby={titleId}>
      <header className="resource-calendar__header">
        <div>
          <h2 id={titleId}>Agenda de reservas y bloqueos</h2>
          {resourceName ? <p className="resource-calendar__resource-name">{resourceName}</p> : null}
          <p>Selecciona un día para ver todos sus movimientos.</p>
        </div>
        {!isLoading && !hasError ? <div className="resource-calendar__summary" aria-label="Resumen del mes">
          <span><strong>{monthBookings.length}</strong> {monthBookings.length === 1 ? "reserva" : "reservas"}</span>
          <span><strong>{blocks.length}</strong> {blocks.length === 1 ? "bloqueo" : "bloqueos"}</span>
        </div> : null}
      </header>
      <div className="resource-calendar__toolbar">
        <Button variant="secondary" iconOnly aria-label="Mes anterior" title="Mes anterior" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} aria-hidden="true" /></Button>
        <strong aria-live="polite">{getMonthLabel(month)}</strong>
        <Button variant="secondary" iconOnly aria-label="Mes siguiente" title="Mes siguiente" onClick={() => shiftMonth(1)}><ChevronRight size={20} aria-hidden="true" /></Button>
        <Button variant="secondary" className="resource-calendar__today" onClick={() => { setMonth(monthStart(today)); setSelectedDay(today); }}>Hoy</Button>
      </div>
      {isLoading ? <div className="resource-calendar__state" role="status" aria-busy="true">Cargando reservas y bloqueos.</div> : hasError ? (
        <div className="resource-calendar__state resource-calendar__state--error" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <p>No pudimos cargar la agenda de este recurso.</p>
          <Button variant="secondary" loading={isRetrying} loadingLabel="Reintentando" onClick={() => void retryAgenda()}>Reintentar</Button>
        </div>
      ) : <>
        <div className="resource-calendar__scroll">
          <div className="resource-calendar__grid" role="group" aria-label={`Días de ${getMonthLabel(month)}`}>
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => <div key={label} className="resource-calendar__weekday" aria-hidden="true">{label}</div>)}
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="resource-calendar__day is-empty" aria-hidden="true" />;
              const movements = movementsByDay.get(day)!;
              const eventCount = movements.bookings.length + movements.blocks.length;
              return <button type="button" key={day}
                ref={(element) => { if (element) dayButtons.current.set(day, element); else dayButtons.current.delete(day); }}
                className={`resource-calendar__day${day === today ? " is-today" : ""}${day === selectedDay ? " is-selected" : ""}`}
                aria-label={`${formatPureDate(day)}${day === today ? ", hoy" : ""}: ${eventCount} ${eventCount === 1 ? "movimiento" : "movimientos"}`}
                aria-pressed={day === selectedDay} aria-current={day === today ? "date" : undefined} aria-controls={dayListId}
                tabIndex={day === selectedDay ? 0 : -1} onClick={() => setSelectedDay(day)} onKeyDown={(event) => selectWithKeyboard(event, day)}>
                <span className="resource-calendar__day-number" aria-hidden="true">{Number(day.slice(-2))}</span>
                <span className="resource-calendar__events" aria-hidden="true">
                  {movements.bookings.slice(0, 2).map((booking) => <span className="resource-calendar__event is-booking" key={booking.id}><CalendarDays size={12} /><span>{bookingStatusLabels[booking.status]}</span></span>)}
                  {movements.blocks.slice(0, Math.max(0, 2 - movements.bookings.length)).map((block) => <span className="resource-calendar__event is-block" key={block.id}><CircleSlash size={12} /><span>Bloqueo</span></span>)}
                  {eventCount > 2 ? <small>+{eventCount - 2} más</small> : null}
                </span>
              </button>;
            })}
          </div>
        </div>
        <div className="resource-calendar__legend">
          <span><CalendarDays size={16} aria-hidden="true" />Reserva</span>
          <span><CircleSlash size={16} aria-hidden="true" />Bloqueo</span>
          {monthBookings.length + blocks.length === 0 ? <span>Sin movimientos en este mes.</span> : null}
        </div>
        <section className="resource-calendar__daily" id={dayListId} aria-labelledby={dayTitleId}>
          <h3 id={dayTitleId} aria-live="polite">Movimientos del {formatPureDate(selectedDay)}</h3>
          {selectedMovements && selectedMovements.bookings.length + selectedMovements.blocks.length > 0 ? <ul className="resource-calendar__movement-list">
            {selectedMovements.bookings.map((booking) => <li key={booking.id} className="resource-calendar__movement">
              <CalendarDays size={20} aria-hidden="true" />
              <div className="resource-calendar__movement-content">
                <p className="resource-calendar__movement-title">Reserva <span className="resource-calendar__status">{bookingStatusLabels[booking.status]}</span></p>
                <p>Entrada: {formatPureDate(booking.checkInDate)} · Salida: {formatPureDate(booking.checkOutDate)}</p>
              </div>
              <Link className="resource-calendar__booking-link" to={`/app/bookings/${booking.id}`} aria-label={`Ver reserva ${booking.id}`}>Ver reserva</Link>
            </li>)}
            {selectedMovements.blocks.map((block) => <li key={block.id} className="resource-calendar__movement is-block">
              <CircleSlash size={20} aria-hidden="true" />
              <div className="resource-calendar__movement-content">
                <p className="resource-calendar__movement-title">Bloqueo <span className="resource-calendar__status">{blockStatusLabels[block.effectiveStatus]}</span></p>
                <p className="resource-calendar__reason">{block.reason || "Sin motivo registrado"}</p>
                <p>Inicio: {formatBusinessInstant(block.startsAt, timezone)} · Fin: {formatBusinessInstant(block.endsAt, timezone)}</p>
              </div>
            </li>)}
          </ul> : <p className="resource-calendar__empty-day">Sin movimientos registrados para este día.</p>}
        </section>
        <footer className="resource-calendar__note">Fechas y horarios del negocio ({timezone}). Esta agenda muestra movimientos; la disponibilidad se valida en la consulta de disponibilidad.</footer>
      </>}
    </section>
  );
}
