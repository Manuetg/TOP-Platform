import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,

  CircleAlert,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../../resources/queries/use-resources";
import { useBookings } from "../../bookings/queries/use-bookings";
import { useBlocks } from "../../blocks/queries/use-blocks";
import { useContacts } from "../../contacts/queries/use-contacts";
import { createContact } from "../../contacts/api/create-contact";
import { createBooking } from "../../bookings/api/create-booking";
import { submitBooking } from "../../bookings/api/submit-booking";
import { confirmBooking } from "../../bookings/api/confirm-booking";
import { useSelectableRatePlans } from "../../pricing/queries/use-selectable-rate-plans";
import { useCalculatePrice } from "../../pricing/queries/use-calculate-price";
import type { CalculatePriceResult } from "../../pricing/types/pricing.types";
import type { Booking, BookingStatus } from "../../bookings/types/booking.types";
import type { Block } from "../../blocks/types/block.types";
import { useAvailabilityCalendar } from "../queries/use-availability-calendar";
import "./AvailabilityCalendarPage.css";

const BUSINESS_ID = import.meta.env.VITE_DEV_BUSINESS_ID ?? "";
const DAY_MS = 86_400_000;

const bookingLabels: Record<BookingStatus, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En estadía",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentada",
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return isoDate(new Date(date.getTime() + days * DAY_MS));
}

function formatMoney(amount: number, currency = "PYG") {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function intersectsDay(start: string | null, end: string | null, day: string) {
  if (!start || !end) return false;
  return start < addDays(day, 1) && end > day;
}

function instantIntersectsDay(start: string, end: string, day: string) {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const dayEnd = dayStart + DAY_MS;
  return Date.parse(start) < dayEnd && Date.parse(end) > dayStart;
}

interface WizardState {
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  resourceId: string;
  contactId: string;
  ratePlanId: string;
  mode: "CONFIGURED" | "MANUAL";
  agreedAmountMinor: string;
  overrideReason: string;
}

const emptyWizard: WizardState = {
  checkIn: "",
  checkOut: "",
  adults: "2",
  children: "0",
  resourceId: "",
  contactId: "",
  ratePlanId: "",
  mode: "CONFIGURED",
  agreedAmountMinor: "",
  overrideReason: "",
};

export function AvailabilityCalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  });
  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [wizard, setWizard] = useState<WizardState>(emptyWizard);
  const [contactQuery, setContactQuery] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    lastName: "",
    phone: "",
    documentType: "",
    documentNumber: "",
  });
  const [preview, setPreview] = useState<CalculatePriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthFrom = isoDate(month);
  const monthTo = isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)));
  const blocksFrom = `${monthFrom}T00:00:00.000Z`;
  const blocksTo = `${monthTo}T00:00:00.000Z`;
  const days = useMemo(() => {
    const count = Math.round((Date.parse(monthTo) - Date.parse(monthFrom)) / DAY_MS);
    return Array.from({ length: count }, (_, index) => addDays(monthFrom, index));
  }, [monthFrom, monthTo]);

  const resourcesQuery = useResources({ businessId: BUSINESS_ID, accessToken });
  const bookingsQuery = useBookings({ businessId: BUSINESS_ID, accessToken });
  const blocksQuery = useBlocks({ businessId: BUSINESS_ID, from: blocksFrom, to: blocksTo, accessToken });
  const calendarQuery = useAvailabilityCalendar({ businessId: BUSINESS_ID, from: monthFrom, to: monthTo, accessToken });
  const contactsQuery = useContacts({ businessId: BUSINESS_ID, query: contactQuery, accessToken });

  const validWizardRange = wizard.checkIn.length > 0 && wizard.checkOut > wizard.checkIn;
  const stayAvailability = useAvailabilityCalendar({
    businessId: BUSINESS_ID,
    from: wizard.checkIn,
    to: wizard.checkOut,
    accessToken,
    enabled: wizardOpen && validWizardRange,
  });
  const ratePlans = useSelectableRatePlans({
    businessId: BUSINESS_ID,
    resourceId: wizard.resourceId,
    checkIn: wizard.checkIn,
    checkOut: wizard.checkOut,
    accessToken,
  });
  const calculate = useCalculatePrice({
    businessId: BUSINESS_ID,
    ratePlanId: wizard.ratePlanId,
    accessToken,
  });

  const resources = useMemo(
    () => [...(resourcesQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [resourcesQuery.data],
  );
  const availableResources = useMemo(() => {
    const byId = new Map((stayAvailability.data?.resources ?? []).map((item) => [item.resourceId, item]));
    return resources.filter((resource) => {
      const entry = byId.get(resource.id);
      return entry?.days.length && entry.days.every((day) => day.status === "AVAILABLE");
    });
  }, [resources, stayAvailability.data]);
  const selectedResource = resources.find((item) => item.id === wizard.resourceId);
  const selectedContact = contactsQuery.data?.find((item) => item.id === wizard.contactId);
  const selectedRate = ratePlans.data?.find((item) => item.id === wizard.ratePlanId);

  useEffect(() => {
    const plans = ratePlans.data ?? [];

    if (
      wizard.resourceId &&
      wizard.checkIn &&
      wizard.checkOut &&
      plans.length === 1 &&
      !wizard.ratePlanId
    ) {
      update("ratePlanId", plans[0].id);
    }
  }, [
    ratePlans.data,
    wizard.resourceId,
    wizard.checkIn,
    wizard.checkOut,
    wizard.ratePlanId,
  ]);

  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: new Intl.DateTimeFormat("es-PY", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, index, 1))),
  }));

  const selectedYear = month.getUTCFullYear();
  const yearOptions = Array.from(
    { length: 11 },
    (_, index) => selectedYear - 5 + index,
  );

  const monthLeadingDays =
    (new Date(`${monthFrom}T00:00:00.000Z`).getUTCDay() + 6) % 7;

  type MobileAgendaItem =
    | {
        kind: "booking";
        resource: (typeof resources)[number];
        booking: Booking;
      }
    | {
        kind: "block";
        resource: (typeof resources)[number];
        block: Block;
      };

  const selectedDayAgenda = resources.reduce<MobileAgendaItem[]>(
    (items, resource) => {
      const booking = (bookingsQuery.data ?? []).find(
        (item) =>
          item.resourceIds.includes(resource.id) &&
          !["DRAFT", "CANCELLED", "NO_SHOW"].includes(item.status) &&
          intersectsDay(item.checkInDate, item.checkOutDate, selectedDay),
      );

      if (booking) {
        items.push({
          kind: "booking",
          resource,
          booking,
        });

        return items;
      }

      const block = (blocksQuery.data ?? []).find(
        (item) =>
          item.resourceId === resource.id &&
          item.effectiveStatus !== "CANCELLED" &&
          instantIntersectsDay(item.startsAt, item.endsAt, selectedDay),
      );

      if (block) {
        items.push({
          kind: "block",
          resource,
          block,
        });
      }

      return items;
    },
    [],
  );

  function changeMonth(nextMonth: number) {
    const next = new Date(Date.UTC(month.getUTCFullYear(), nextMonth, 1));
    setMonth(next);
    setSelectedDay(isoDate(next));
  }

  function changeYear(nextYear: number) {
    const next = new Date(Date.UTC(nextYear, month.getUTCMonth(), 1));
    setMonth(next);
    setSelectedDay(isoDate(next));
  }

  function goToToday() {
    const now = new Date();
    const today = isoDate(now);
    setMonth(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
    setSelectedDay(today);
  }

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setWizard((current) => ({ ...current, [key]: value }));
    setError(null);
    if (key === "resourceId" || key === "checkIn" || key === "checkOut" || key === "ratePlanId") {
      setPreview(null);
    }
  }

  function openWizard(day?: string, resourceId?: string) {
    setWizard({
      ...emptyWizard,
      checkIn: day ?? "",
      checkOut: day ? addDays(day, 1) : "",
      resourceId: resourceId ?? "",
    });
    setStep(1);
    setPreview(null);
    setError(null);
    setWizardOpen(true);
  }

  async function nextStep() {
    setError(null);
    if (step === 1) {
      const adults = Number(wizard.adults);
      const children = Number(wizard.children);
      if (!validWizardRange || !Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
        setError("Completá una estadía válida y la cantidad de huéspedes.");
        return;
      }
      if (stayAvailability.isLoading) return;
      if (stayAvailability.isError) {
        setError(stayAvailability.error instanceof Error ? stayAvailability.error.message : "No pudimos consultar disponibilidad.");
        return;
      }
    }
    if (step === 2 && !wizard.resourceId) {
      setError("Elegí un alojamiento disponible.");
      return;
    }
    if (step === 3 && !wizard.contactId) {
      setError("Elegí o creá un contacto.");
      return;
    }
    if (step === 4) {
      if (!wizard.ratePlanId) {
        setError("Elegí un plan tarifario.");
        return;
      }
      if (wizard.mode === "MANUAL") {
        const amount = Number(wizard.agreedAmountMinor);
        if (!Number.isSafeInteger(amount) || amount < 0 || wizard.overrideReason.trim().length < 2 || wizard.overrideReason.trim().length > 500) {
          setError("Ingresá un monto válido y un motivo de 2 a 500 caracteres.");
          return;
        }
      }
      if (!preview) {
        try {
          setPreview(await calculate.mutateAsync({ resourceId: wizard.resourceId, checkIn: wizard.checkIn, checkOut: wizard.checkOut }));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "No pudimos calcular la tarifa.");
          return;
        }
      }
    }
    setStep((current) => Math.min(5, current + 1));
  }

  async function handleCreateContact() {
    setError(null);
    if (newContact.name.trim().length < 2 || newContact.lastName.trim().length < 2 || newContact.phone.trim().length < 6) {
      setError("Completá nombre, apellido y teléfono del contacto.");
      return;
    }
    try {
      const contact = await createContact({
        businessId: BUSINESS_ID,
        accessToken,
        input: {
          name: newContact.name.trim(),
          lastName: newContact.lastName.trim(),
          phone: newContact.phone.trim(),
          documentType:
            newContact.documentType === "PASSPORT"
              ? "Pasaporte"
              : newContact.documentType === "CI"
                ? "CI"
                : null,
          documentNumber: newContact.documentNumber.trim() || null,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: ["contacts", BUSINESS_ID],
      });

      setContactQuery("");
      update("contactId", contact.id);
      setCreatingContact(false);

      setNewContact({
        name: "",
        lastName: "",
        phone: "",
        documentType: "",
        documentNumber: "",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos crear el contacto.");
    }
  }

  async function finishBooking() {
    if (!preview || !wizard.ratePlanId) return;
    setSaving(true);
    setError(null);
    try {
      const booking = await createBooking({
        businessId: BUSINESS_ID,
        accessToken,
        input: {
          contactId: wizard.contactId,
          resourceIds: [wizard.resourceId],
          checkInDate: wizard.checkIn,
          checkOutDate: wizard.checkOut,
          adults: Number(wizard.adults),
          children: Number(wizard.children),
        },
      });
      await submitBooking({ businessId: BUSINESS_ID, bookingId: booking.id, accessToken });
      await confirmBooking({
        businessId: BUSINESS_ID,
        bookingId: booking.id,
        accessToken,
        input: {
          pricing: [{
            resourceId: wizard.resourceId,
            ratePlanId: wizard.ratePlanId,
            ...(wizard.mode === "MANUAL"
              ? { agreedAmountMinor: Number(wizard.agreedAmountMinor), overrideReason: wizard.overrideReason.trim() }
              : {}),
          }],
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["bookings", BUSINESS_ID] });
      setWizardOpen(false);
      navigate(`/app/bookings/${booking.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos confirmar la reserva.");
    } finally {
      setSaving(false);
    }
  }

  const isLoading = resourcesQuery.isLoading || bookingsQuery.isLoading || blocksQuery.isLoading || calendarQuery.isLoading;
  const hasError = resourcesQuery.isError || bookingsQuery.isError || blocksQuery.isError || calendarQuery.isError;

  return (
    <section className="availability-calendar-page">
      <header className="availability-calendar-hero">
        <div>
          <span>Centro operativo</span>
          <h1>Calendario</h1>
          <p>Reservas, disponibilidad y bloqueos en una sola vista.</p>
        </div>
        <Button type="button" onClick={() => openWizard()}><Plus size={17} />Nueva reserva</Button>
      </header>

      <div className="availability-calendar-toolbar">
        <div className="availability-calendar-period-selectors">
          <label>
            <span>Mes</span>
            <select
              aria-label="Mes"
              value={month.getUTCMonth()}
              onChange={(event) => changeMonth(Number(event.target.value))}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Año</span>
            <select
              aria-label="Año"
              value={selectedYear}
              onChange={(event) => changeYear(Number(event.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="availability-calendar-today"
          onClick={goToToday}
        >
          Hoy
        </button>
      </div>

      {isLoading ? <div className="availability-calendar-state" aria-busy="true">Preparando el calendario…</div> : hasError ? (
        <div className="availability-calendar-state availability-calendar-state--error" role="alert"><CircleAlert size={20} />No pudimos cargar el calendario.</div>
      ) : (
        <>
        <div className="availability-calendar-mobile">
          <div className="availability-mobile-weekdays" aria-hidden="true">
            {["L", "M", "X", "J", "V", "S", "D"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="availability-mobile-month-grid">
            {Array.from({ length: monthLeadingDays }, (_, index) => (
              <span
                key={`empty-${index}`}
                className="availability-mobile-day-spacer"
                aria-hidden="true"
              />
            ))}

            {days.map((day) => {
              const date = new Date(`${day}T00:00:00.000Z`);
              const isToday = day === isoDate(new Date());
              const isSelected = day === selectedDay;

              const hasBooking = (bookingsQuery.data ?? []).some(
                (item) =>
                  !["DRAFT", "CANCELLED", "NO_SHOW"].includes(item.status) &&
                  intersectsDay(item.checkInDate, item.checkOutDate, day),
              );

              const hasBlock = (blocksQuery.data ?? []).some(
                (item) =>
                  item.effectiveStatus !== "CANCELLED" &&
                  instantIntersectsDay(item.startsAt, item.endsAt, day),
              );

              return (
                <button
                  key={day}
                  type="button"
                  className={`availability-mobile-day${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDay(day)}
                >
                  <span>{date.getUTCDate()}</span>

                  <span className="availability-mobile-day-markers" aria-hidden="true">
                    {hasBooking && <i className="is-booking" />}
                    {hasBlock && <i className="is-block" />}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="availability-mobile-agenda">
            <header>
              <div>
                <span>Agenda</span>
                <strong>
                  {new Intl.DateTimeFormat("es-PY", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${selectedDay}T00:00:00.000Z`))}
                </strong>
              </div>

              <button
                type="button"
                className="availability-mobile-new-booking"
                onClick={() => openWizard(selectedDay)}
              >
                <Plus size={16} />
                Reserva
              </button>
            </header>

            {selectedDayAgenda.length === 0 ? (
              <button
                type="button"
                className="availability-mobile-empty-day"
                onClick={() => openWizard(selectedDay)}
              >
                <Plus size={18} />
                <span>
                  <strong>Sin movimientos</strong>
                  <small>Crear una reserva para este día</small>
                </span>
              </button>
            ) : (
              <div className="availability-mobile-events">
                {selectedDayAgenda.map((item) =>
                  item.kind === "booking" ? (
                    <button
                      type="button"
                      key={`booking-${item.resource.id}-${item.booking.id}`}
                      className="availability-mobile-event is-booking"
                      onClick={() => navigate(`/app/bookings/${item.booking.id}`)}
                    >
                      <span className="availability-mobile-event-dot" />
                      <span>
                        <strong>{item.resource.name}</strong>
                        <small>
                          {bookingLabels[item.booking.status]}
                          {item.booking.checkInDate && item.booking.checkOutDate
                            ? ` · ${item.booking.checkInDate} → ${item.booking.checkOutDate}`
                            : ""}
                        </small>
                      </span>
                    </button>
                  ) : (
                    <div
                      key={`block-${item.resource.id}-${item.block.id}`}
                      className="availability-mobile-event is-block"
                    >
                      <span className="availability-mobile-event-dot" />
                      <span>
                        <strong>{item.resource.name}</strong>
                        <small>{item.block.reason}</small>
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        </div>

        <div className="availability-calendar-desktop">
          <div className="availability-calendar-shell">
          <div className="availability-calendar-scroll">
            <div className="availability-calendar-grid" style={{ gridTemplateColumns: `minmax(180px, 220px) repeat(${days.length}, minmax(46px, 1fr))` }}>
              <div className="availability-calendar-corner">Alojamiento</div>
              {days.map((day) => {
                const date = new Date(`${day}T00:00:00.000Z`);
                const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                const today = day === isoDate(new Date());
                return <div key={day} className={`availability-calendar-day-head${weekend ? " is-weekend" : ""}${today ? " is-today" : ""}`}><span>{new Intl.DateTimeFormat("es-PY", { weekday: "short", timeZone: "UTC" }).format(date).slice(0, 2)}</span><strong>{date.getUTCDate()}</strong></div>;
              })}
              {resources.map((resource) => {
                const calendarResource = calendarQuery.data?.resources.find((item) => item.resourceId === resource.id);
                return [
                  <div key={`${resource.id}-name`} className="availability-calendar-resource"><strong>{resource.name}</strong><span>Hasta {resource.capacityMaximum} huéspedes</span></div>,
                  ...days.map((day) => {
                    const availability = calendarResource?.days.find((item) => item.date === day);
                    const booking = (bookingsQuery.data ?? []).find((item) => item.resourceIds.includes(resource.id) && !["DRAFT", "CANCELLED", "NO_SHOW"].includes(item.status) && intersectsDay(item.checkInDate, item.checkOutDate, day));
                    const block = (blocksQuery.data ?? []).find((item) => item.resourceId === resource.id && item.effectiveStatus !== "CANCELLED" && instantIntersectsDay(item.startsAt, item.endsAt, day));
                    const free = availability?.status === "AVAILABLE";
                    return <CalendarCell key={`${resource.id}-${day}`} day={day} resourceId={resource.id} booking={booking} block={block} free={free} onFreeClick={openWizard} />;
                  }),
                ];
              })}
            </div>
          </div>
          <footer className="availability-calendar-legend"><span><i className="is-confirmed" />Confirmada</span><span><i className="is-pending" />Pendiente</span><span><i className="is-stay" />En estadía</span><span><i className="is-block" />Bloqueo</span><small>Seleccioná un día libre para iniciar una reserva.</small></footer>
        </div>
        </div>
        </>

      )}

      {wizardOpen && (
        <div className="booking-wizard-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWizardOpen(false); }}>
          <aside className="booking-wizard" role="dialog" aria-modal="true" aria-labelledby="booking-wizard-title">
            <header><div><span>Paso {step} de 5</span><h2 id="booking-wizard-title">Nueva reserva</h2></div><button type="button" aria-label="Cerrar" onClick={() => setWizardOpen(false)}><X size={20} /></button></header>
            <div className="booking-wizard-progress" aria-hidden="true">{[1,2,3,4,5].map((item) => <i key={item} className={item <= step ? "is-active" : ""} />)}</div>
            <div className="booking-wizard-body">
              {step === 1 && <StayStep wizard={wizard} update={update} />}
              {step === 2 && <ResourceStep resources={availableResources} selected={wizard.resourceId} loading={stayAvailability.isLoading} onSelect={(id) => update("resourceId", id)} />}
              {step === 3 && <ContactStep contacts={contactsQuery.data ?? []} query={contactQuery} selected={wizard.contactId} creating={creatingContact} newContact={newContact} onQuery={setContactQuery} onSelect={(id) => update("contactId", id)} onToggleCreate={setCreatingContact} onNewContact={setNewContact} onCreate={() => void handleCreateContact()} />}
              {step === 4 && <RateStep wizard={wizard} ratePlans={ratePlans.data ?? []} loading={ratePlans.isLoading} preview={preview} update={update} />}
              {step === 5 && <ReviewStep wizard={wizard} resourceName={selectedResource?.name} contactName={selectedContact?.fullName} rateName={selectedRate?.name} preview={preview} />}
              {error && <div className="booking-wizard-error" role="alert">{error}</div>}
            </div>
            <footer>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    setStep((current) => Math.max(1, current - 1));
                    setError(null);
                  }}
                >
                  <ArrowLeft size={16} />
                  Atrás
                </Button>
              ) : (
                <span aria-hidden="true" />
              )}
              {step < 5 ? <Button type="button" disabled={saving || (step === 1 && stayAvailability.isLoading)} onClick={() => void nextStep()}>{step === 1 ? "Buscar disponibilidad" : "Continuar"}<ArrowRight size={16} /></Button> : <Button type="button" disabled={saving} onClick={() => void finishBooking()}>{saving ? "Confirmando…" : "Confirmar reserva"}<Check size={16} /></Button>}
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}

function CalendarCell({ day, resourceId, booking, block, free, onFreeClick }: { day: string; resourceId: string; booking?: Booking; block?: Block; free: boolean; onFreeClick: (day?: string, resourceId?: string) => void }) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  if (booking) return <button type="button" className={`availability-calendar-cell is-booking is-${booking.status.toLowerCase()}`} title={bookingLabels[booking.status]}><span>{bookingLabels[booking.status]}</span></button>;
  if (block) return <button type="button" className={`availability-calendar-cell is-block${weekend ? " is-weekend" : ""}`} title={block.reason}><span>Bloqueo</span></button>;
  return <button type="button" className={`availability-calendar-cell${weekend ? " is-weekend" : ""}${free ? " is-free" : " is-unavailable"}`} disabled={!free} aria-label={free ? `Crear reserva para ${day}` : `No disponible el ${day}`} onClick={() => onFreeClick(day, resourceId)}>{free && <Plus size={14} />}</button>;
}

function formatDateForDisplay(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return "";

  return `${day}-${month}-${year}`;
}

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="booking-wizard-date-field">
      <span>{label}</span>

      <div className="booking-wizard-date-control">
        <span className={value ? "" : "is-placeholder"}>
          {value ? formatDateForDisplay(value) : "dd-mm-aaaa"}
        </span>

        <CalendarDays size={18} aria-hidden="true" />

        <input
          type="date"
          value={value}
          min={min}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}
function StayStep({
  wizard,
  update,
}: {
  wizard: WizardState;
  update: <K extends keyof WizardState>(
    key: K,
    value: WizardState[K],
  ) => void;
}) {
  function handleCheckIn(value: string) {
    update("checkIn", value);

    if (!value) {
      update("checkOut", "");
      return;
    }

    update("checkOut", addDays(value, 1));
  }

  return (
    <>
      <div className="booking-wizard-heading">
        <CalendarDays size={22} />
        <div>
          <h3>¿Cuándo se hospedan?</h3>
          <p>Buscá alojamientos disponibles para la estadía.</p>
        </div>
      </div>

      <div className="booking-wizard-fields">
        <DateField
          label="Entrada"
          value={wizard.checkIn}
          onChange={handleCheckIn}
        />

        <DateField
          label="Salida"
          value={wizard.checkOut}
          min={wizard.checkIn || undefined}
          onChange={(value) => update("checkOut", value)}
        />

        <label>
          Adultos
          <input
            type="number"
            min="0"
            step="1"
            value={wizard.adults}
            onChange={(event) => update("adults", event.target.value)}
          />
        </label>

        <label>
          Niños
          <input
            type="number"
            min="0"
            step="1"
            value={wizard.children}
            onChange={(event) => update("children", event.target.value)}
          />
        </label>
      </div>
    </>
  );
}

function ResourceStep({ resources, selected, loading, onSelect }: { resources: ReturnType<typeof useResources>["data"] extends infer T ? NonNullable<T> : never; selected: string; loading: boolean; onSelect: (id: string) => void }) {
  return <><div className="booking-wizard-heading"><Search size={22} /><div><h3>Elegí un alojamiento</h3><p>Solo aparecen unidades disponibles durante toda la estadía.</p></div></div>{loading ? <div className="booking-wizard-empty">Consultando disponibilidad…</div> : resources.length === 0 ? <div className="booking-wizard-empty">No hay alojamientos disponibles para estas fechas.</div> : <div className="booking-wizard-options">{resources.map((resource) => <button type="button" key={resource.id} className={selected === resource.id ? "is-selected" : ""} onClick={() => onSelect(resource.id)}><span><strong>{resource.name}</strong><small>Hasta {resource.capacityMaximum} huéspedes</small></span>{selected === resource.id && <Check size={18} />}</button>)}</div>}</>;
}

function getContactSummary(contact: {
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
}) {
  const parts: string[] = [];

  if (contact.documentNumber) {
    parts.push(
      `${contact.documentType ?? "Documento"} · ${contact.documentNumber}`,
    );
  }

  if (contact.phone) {
    parts.push(contact.phone);
  }

  if (parts.length === 0 && contact.email) {
    parts.push(contact.email);
  }

  return parts.join(" · ") || "Sin datos de contacto";
}

function ContactStep({
  contacts,
  query,
  selected,
  creating,
  newContact,
  onQuery,
  onSelect,
  onToggleCreate,
  onNewContact,
  onCreate,
}: {
  contacts: NonNullable<ReturnType<typeof useContacts>["data"]>;
  query: string;
  selected: string;
  creating: boolean;
  newContact: {
    name: string;
    lastName: string;
    phone: string;
    documentType: string;
    documentNumber: string;
  };
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onToggleCreate: (value: boolean) => void;
  onNewContact: (value: {
    name: string;
    lastName: string;
    phone: string;
    documentType: string;
    documentNumber: string;
  }) => void;
  onCreate: () => void;
}) {
  const selectedContact = contacts.find(
    (contact) => contact.id === selected,
  );

  return (
    <>
      <div className="booking-wizard-heading">
        <UserPlus size={22} />
        <div>
          <h3>¿Quién se hospeda?</h3>
          <p>Elegí un contacto o crealo sin salir de la reserva.</p>
        </div>
      </div>

      {creating ? (
        <div className="booking-wizard-fields booking-wizard-fields--single">
          <label>
            Nombre
            <input
              value={newContact.name}
              onChange={(event) =>
                onNewContact({
                  ...newContact,
                  name: event.target.value,
                })
              }
            />
          </label>

          <label>
            Apellido
            <input
              value={newContact.lastName}
              onChange={(event) =>
                onNewContact({
                  ...newContact,
                  lastName: event.target.value,
                })
              }
            />
          </label>

          <label>
            Teléfono
            <input
              value={newContact.phone}
              onChange={(event) =>
                onNewContact({
                  ...newContact,
                  phone: event.target.value,
                })
              }
            />
          </label>

          <label>
            Tipo de documento
            <select
              value={newContact.documentType}
              onChange={(event) =>
                onNewContact({
                  ...newContact,
                  documentType: event.target.value,
                })
              }
            >
              <option value="">Seleccionar</option>
              <option value="CI">CI</option>
              <option value="PASSPORT">Pasaporte</option>
            </select>
          </label>

          <label>
            Número de documento
            <input
              type="text"
              maxLength={120}
              value={newContact.documentNumber}
              onChange={(event) =>
                onNewContact({
                  ...newContact,
                  documentNumber: event.target.value,
                })
              }
            />
          </label>

          <div className="booking-wizard-inline-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onToggleCreate(false)}
            >
              Cancelar
            </Button>

            <Button type="button" onClick={onCreate}>
              Crear contacto
            </Button>
          </div>
        </div>
      ) : (
        <>
          {selectedContact && (
            <div className="booking-wizard-selected-contact">
              <span>
                <strong>{selectedContact.fullName}</strong>
                <small>{getContactSummary(selectedContact)}</small>
              </span>

              <Check size={18} aria-hidden="true" />
            </div>
          )}

          <label className="booking-wizard-search">
            <Search size={17} aria-hidden="true" />

            <input
              type="search"
              placeholder="Buscar por nombre, teléfono o documento"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
          </label>

          <div className="booking-wizard-options">
            {contacts.filter((contact) => contact.id !== selected).map((contact) => (
              <button
                type="button"
                key={contact.id}
                className={selected === contact.id ? "is-selected" : ""}
                onClick={() => onSelect(contact.id)}
              >
                <span>
                  <strong>{contact.fullName}</strong>
                  <small>{getContactSummary(contact)}</small>
                </span>

                {selected === contact.id && <Check size={18} />}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => onToggleCreate(true)}
          >
            <Plus size={16} />
            Crear contacto
          </Button>
        </>
      )}
    </>
  );
}
function RateStep({ wizard, ratePlans, loading, preview, update }: { wizard: WizardState; ratePlans: NonNullable<ReturnType<typeof useSelectableRatePlans>["data"]>; loading: boolean; preview: CalculatePriceResult | null; update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void }) {
  return <><div className="booking-wizard-heading"><span className="booking-wizard-currency">₲</span><div><h3>Definí la tarifa</h3><p>Ambas opciones requieren un plan válido para esta estadía.</p></div></div><div className="booking-wizard-segments"><button type="button" className={wizard.mode === "CONFIGURED" ? "is-active" : ""} onClick={() => update("mode", "CONFIGURED")}>Configurada</button><button type="button" className={wizard.mode === "MANUAL" ? "is-active" : ""} onClick={() => update("mode", "MANUAL")}>Manual</button></div>{loading ? <div className="booking-wizard-empty">Buscando planes tarifarios…</div> : <div className="booking-wizard-options">{ratePlans.map((plan) => <button type="button" key={plan.id} className={wizard.ratePlanId === plan.id ? "is-selected" : ""} onClick={() => update("ratePlanId", plan.id)}><span><strong>{plan.name}</strong><small>Base {formatMoney(plan.baseNightlyAmountMinor, plan.currency)}</small></span>{wizard.ratePlanId === plan.id && <Check size={18} />}</button>)}</div>}{wizard.mode === "MANUAL" && <div className="booking-wizard-fields booking-wizard-fields--single"><label>Monto total acordado<input type="number" min="0" step="1" value={wizard.agreedAmountMinor} onChange={(e) => update("agreedAmountMinor", e.target.value)} /></label><label>Motivo del ajuste<textarea rows={3} maxLength={500} value={wizard.overrideReason} onChange={(e) => update("overrideReason", e.target.value)} /></label></div>}{preview && <div className="booking-wizard-price"><span>Precio sugerido</span><strong>{formatMoney(preview.totalAmountMinor, preview.currency)}</strong><small>{preview.nights} {preview.nights === 1 ? "noche" : "noches"}</small></div>}</>;
}

function ReviewStep({ wizard, resourceName, contactName, rateName, preview }: { wizard: WizardState; resourceName?: string; contactName?: string; rateName?: string; preview: CalculatePriceResult | null }) {
  const total = wizard.mode === "MANUAL" ? Number(wizard.agreedAmountMinor) : preview?.totalAmountMinor ?? 0;
  return <><div className="booking-wizard-heading"><Check size={22} /><div><h3>Revisá y confirmá</h3><p>TOP volverá a validar disponibilidad y precio al confirmar.</p></div></div><dl className="booking-wizard-review"><div><dt>Contacto</dt><dd>{contactName}</dd></div><div><dt>Alojamiento</dt><dd>{resourceName}</dd></div><div><dt>Estadía</dt><dd>{wizard.checkIn} → {wizard.checkOut}</dd></div><div><dt>Huéspedes</dt><dd>{wizard.adults} adultos · {wizard.children} niños</dd></div><div><dt>Tarifa</dt><dd>{rateName}{wizard.mode === "MANUAL" ? " · ajuste manual" : ""}</dd></div><div className="is-total"><dt>Total acordado</dt><dd>{formatMoney(total, preview?.currency)}</dd></div></dl></>;
}
