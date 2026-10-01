import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
} from "lucide-react";
import { useBookings } from "../../bookings/queries/use-bookings";
import type { Booking, BookingStatus } from "../../bookings/types/booking.types";
import { useBlocks } from "../../blocks/queries/use-blocks";
import type { Block } from "../../blocks/types/block.types";
import {
  addCalendarDays,
  businessDateAt,
  businessDayStartInstant,
  businessDayInstantRange,
  instantIntersectsRange,
} from "../../../shared/utils/business-date";
import { formatPureDate } from "../../../shared/utils/date-format";
import "./ResourceAvailabilityCalendar.css";

interface ResourceAvailabilityCalendarProps {
  businessId: string;
  resourceId: string;
  timezone: string;
  accessToken?: string | null;
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En estadía",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentada",
};

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function monthDays(start: string) {
  const [year, month] = start.slice(0, 7).split("-").map(Number);
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) =>
    addCalendarDays(start, index),
  );
}

function isActiveBooking(booking: Booking) {
  return !["CANCELLED", "NO_SHOW"].includes(booking.status);
}

function bookingIntersectsDay(booking: Booking, day: string) {
  return Boolean(
    booking.checkInDate &&
      booking.checkOutDate &&
      booking.checkInDate <= day &&
      day < booking.checkOutDate,
  );
}

function blockIntersectsDay(block: Block, day: string, timezone: string) {
  return block.effectiveStatus !== "CANCELLED" &&
    instantIntersectsRange(
      block.startsAt,
      block.endsAt,
      businessDayInstantRange(day, timezone),
    );
}

function getMonthLabel(start: string) {
  return new Intl.DateTimeFormat("es-PY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${start}T00:00:00.000Z`));
}

export function ResourceAvailabilityCalendar({
  businessId,
  resourceId,
  timezone,
  accessToken,
}: ResourceAvailabilityCalendarProps) {
  const today = businessDateAt(new Date(), timezone);
  const [month, setMonth] = useState(() => monthStart(today));
  const days = useMemo(() => monthDays(month), [month]);
  const nextMonth = addCalendarDays(month, days.length);
  const firstWeekday =
    (new Date(`${month}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const cells = useMemo(
    () => [
      ...Array.from({ length: firstWeekday }, () => null),
      ...days,
      ...Array.from(
        { length: (7 - ((firstWeekday + days.length) % 7)) % 7 },
        () => null,
      ),
    ],
    [days, firstWeekday],
  );

  const bookingsQuery = useBookings({
    businessId,
    resourceId,
    accessToken,
  });
  const blocksQuery = useBlocks({
    businessId,
    resourceId,
    from: businessDayStartInstant(month, timezone),
    to: businessDayStartInstant(nextMonth, timezone),
    accessToken,
  });

  const bookings = useMemo(
    () => (bookingsQuery.data ?? []).filter(isActiveBooking),
    [bookingsQuery.data],
  );
  const monthBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          Boolean(booking.checkInDate && booking.checkOutDate) &&
          booking.checkInDate! < nextMonth &&
          booking.checkOutDate! > month,
      ),
    [bookings, month, nextMonth],
  );
  const blocks = useMemo(
    () => (blocksQuery.data ?? []).filter((block) => block.effectiveStatus !== "CANCELLED"),
    [blocksQuery.data],
  );
  const isLoading = bookingsQuery.isLoading || blocksQuery.isLoading;
  const hasError = bookingsQuery.isError || blocksQuery.isError;

  function shiftMonth(delta: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }

  return (
    <section className="resource-calendar" aria-labelledby="resource-calendar-title">
      <header className="resource-calendar__header">
        <div>
          <span className="resource-calendar__eyebrow">Agenda del recurso</span>
          <h2 id="resource-calendar-title">Reservas y bloqueos</h2>
          <p>Consultá la ocupación de este recurso por día.</p>
        </div>

        <div className="resource-calendar__summary" aria-label="Resumen del mes">
          <span><strong>{monthBookings.length}</strong> reservas</span>
          <span><strong>{blocks.length}</strong> bloqueos</span>
        </div>
      </header>

      <div className="resource-calendar__toolbar">
        <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>{getMonthLabel(month)}</strong>
        <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="resource-calendar__today"
          onClick={() => setMonth(monthStart(today))}
        >
          Hoy
        </button>
      </div>

      {isLoading ? (
        <div className="resource-calendar__state" role="status" aria-busy="true">
          Cargando reservas y bloqueos…
        </div>
      ) : hasError ? (
        <div className="resource-calendar__state resource-calendar__state--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          No pudimos cargar la agenda de este recurso.
        </div>
      ) : (
        <>
          <div className="resource-calendar__scroll">
            <div className="resource-calendar__grid">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => (
                <div key={label} className="resource-calendar__weekday">{label}</div>
              ))}

              {cells.map((day, index) => {
                const dayBookings = day
                  ? monthBookings.filter((booking) => bookingIntersectsDay(booking, day))
                  : [];
                const dayBlocks = day
                  ? blocks.filter((block) => blockIntersectsDay(block, day, timezone))
                  : [];
                const eventCount = dayBookings.length + dayBlocks.length;

                return (
                  <div
                    key={day ?? `empty-${index}`}
                    className={`resource-calendar__day${day === today ? " is-today" : ""}${day ? "" : " is-empty"}`}
                    aria-label={day ? `${formatPureDate(day)}: ${eventCount} movimientos` : undefined}
                  >
                    {day ? (
                      <>
                        <span className="resource-calendar__day-number">{Number(day.slice(-2))}</span>
                        <div className="resource-calendar__events">
                          {dayBookings.slice(0, 2).map((booking) => (
                            <span className={`resource-calendar__event is-booking is-${booking.status.toLowerCase()}`} key={booking.id} title={bookingStatusLabels[booking.status]}>
                              <CalendarDays size={12} aria-hidden="true" />
                              {bookingStatusLabels[booking.status]}
                            </span>
                          ))}
                          {dayBlocks.slice(0, Math.max(0, 2 - dayBookings.length)).map((block) => (
                            <span className="resource-calendar__event is-block" key={block.id} title={block.reason}>
                              <CircleSlash size={12} aria-hidden="true" />
                              {block.reason || "Bloqueo"}
                            </span>
                          ))}
                          {eventCount > 2 ? <small>+{eventCount - 2} más</small> : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <footer className="resource-calendar__legend">
            <span><i className="is-booking" />Reserva</span>
            <span><i className="is-block" />Bloqueo</span>
            <small>{monthBookings.length + blocks.length === 0 ? "Sin movimientos en este mes" : "Los eventos se muestran según la fecha del negocio"}</small>
          </footer>
        </>
      )}
    </section>
  );
}
