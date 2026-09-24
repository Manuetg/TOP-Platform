import { normalizePhone, phonePrefix } from "../../contacts/utils/contact-phone";
import { COUNTRIES } from "../../contacts/constants/countries";
import { Input } from "../../../shared/ui/Input";
import { formatPureDate as formatDateForDisplay } from "../../../shared/utils/date-format";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { addCalendarDays as addDays, businessDateAt, businessDayInstantRange, businessDayStartInstant, instantIntersectsRange } from "../../../shared/utils/business-date";
import { formatMoney, parseGuaranies } from "../../../shared/utils/money";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../shared/ui/Button";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
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

/** Soporte UTC para aritmética y etiquetas de fecha pura; nunca un instante del Business. */
function calendarDateFromCarrier(date: Date) {
  return date.toISOString().slice(0, 10);
}

function guaraniesToMinor(value: string) { return parseGuaranies(value, true); }

function formatGuaranies(value: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(value);
}

function formatManualInput(value: number) {
  return formatGuaranies(value);
}

function intersectsDay(start: string | null, end: string | null, day: string) {
  if (!start || !end) return false;
  return start < addDays(day, 1) && end > day;
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
  discountPercent: string;
  customDiscountPercent: string;
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
  discountPercent: "",
  customDiscountPercent: "",
};

function selectedDiscountPercent(wizard: WizardState) {
  return wizard.discountPercent === "OTHER"
    ? Number(wizard.customDiscountPercent)
    : Number(wizard.discountPercent || 0);
}

export function AvailabilityCalendarPage() {
  const { activeBusiness } = useBusinessContext();
  const { session } = useAuth();
  if (!activeBusiness) return <p role="status">Seleccioná un negocio para ver el calendario.</p>;
  return <BusinessCalendar key={`${session?.user.id}:${activeBusiness.id}:${activeBusiness.timezone}`} businessId={activeBusiness.id} timezone={activeBusiness.timezone} />;
}

function BusinessCalendar({ businessId, timezone }: { businessId: string; timezone: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { activeRole } = useBusinessContext();
  const canOverride = activeRole === "OWNER" || activeRole === "ADMIN";
  const accessToken = session?.accessToken;
  const today = businessDateAt(new Date(), timezone);
  const operations = useRef(new Set<AbortController>());
  const wizardTrigger = useRef<HTMLElement | null>(null);
  const savingLock = useRef(false);
  useEffect(() => { const pending = operations.current; return () => { for (const controller of pending) controller.abort(); pending.clear(); }; }, [businessId, session?.user.id]);
  function operation() { const controller = new AbortController(); operations.current.add(controller); return controller; }
  function closeWizard() { for (const controller of operations.current) controller.abort(); operations.current.clear(); savingLock.current = false; wizardTrigger.current?.focus(); setSaving(false); setWizardOpen(false); }
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`));
  const [selectedDay, setSelectedDay] = useState(today);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [wizard, setWizard] = useState<WizardState>(emptyWizard);
  const [contactQuery, setContactQuery] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    lastName: "",
    phone: "",
    country: "Paraguay",
    documentType: "",
    documentNumber: "",
  });
  const [preview, setPreview] = useState<CalculatePriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthFrom = calendarDateFromCarrier(month);
  const monthTo = calendarDateFromCarrier(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)));
  const blocksFrom = useMemo(() => businessDayStartInstant(monthFrom, timezone), [monthFrom, timezone]);
  const blocksTo = useMemo(() => businessDayStartInstant(monthTo, timezone), [monthTo, timezone]);
  const days = useMemo(() => {
    const count = Math.round((Date.parse(monthTo) - Date.parse(monthFrom)) / DAY_MS);
    return Array.from({ length: count }, (_, index) => addDays(monthFrom, index));
  }, [monthFrom, monthTo]);

  const dayRanges = useMemo(() => new Map(days.map((day) => [day, businessDayInstantRange(day, timezone)])), [days, timezone]);
  function instantIntersectsDay(start: string, end: string, day: string) {
    const range = dayRanges.get(day);
    return Boolean(range && instantIntersectsRange(start, end, range));
  }

  const resourcesQuery = useResources({ businessId: businessId, accessToken });
  const bookingsQuery = useBookings({ businessId: businessId, accessToken });
  const blocksQuery = useBlocks({ businessId: businessId, from: blocksFrom, to: blocksTo, accessToken });
  const calendarQuery = useAvailabilityCalendar({ businessId: businessId, from: monthFrom, to: monthTo, accessToken });
  const contactsQuery = useContacts({ businessId: businessId, query: contactQuery, accessToken });

  const validWizardRange = wizard.checkIn.length > 0 && wizard.checkOut > wizard.checkIn;
  const stayAvailability = useAvailabilityCalendar({
    businessId: businessId,
    from: wizard.checkIn,
    to: wizard.checkOut,
    accessToken,
    enabled: wizardOpen && validWizardRange,
  });
  const ratePlans = useSelectableRatePlans({
    businessId: businessId,
    resourceId: wizard.resourceId,
    checkIn: wizard.checkIn,
    checkOut: wizard.checkOut,
    accessToken,
  });
  const calculate = useCalculatePrice({
    businessId: businessId,
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
    if (!ratePlans.isSuccess) return;
    const plans = ratePlans.data ?? [];
    if (!plans.some((plan) => plan.id === wizard.ratePlanId)) {
      const next = plans.length === 1 ? plans[0].id : "";
      if (next !== wizard.ratePlanId) update("ratePlanId", next);
    }
  }, [ratePlans.data, ratePlans.isSuccess, wizard.ratePlanId]);

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

  function openBooking(bookingId: string) {
    navigate(`/app/bookings/${bookingId}`, {
      state: {
        fromCalendar: true,
      },
    });
  }

  function changeMonth(nextMonth: number) {
    const next = new Date(Date.UTC(month.getUTCFullYear(), nextMonth, 1));
    setMonth(next);
    setSelectedDay(calendarDateFromCarrier(next));
  }

  function changeYear(nextYear: number) {
    const next = new Date(Date.UTC(nextYear, month.getUTCMonth(), 1));
    setMonth(next);
    setSelectedDay(calendarDateFromCarrier(next));
  }

  function goToToday() {
    const currentBusinessDate = businessDateAt(new Date(), timezone);
    setMonth(new Date(`${currentBusinessDate.slice(0, 7)}-01T00:00:00.000Z`));
    setSelectedDay(currentBusinessDate);
  }

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    if (["resourceId", "checkIn", "checkOut", "ratePlanId", "mode"].includes(key)) {
      for (const controller of operations.current) controller.abort();
      operations.current.clear();
      setSaving(false);
    }
    setWizard((current) => ({ ...current, [key]: value, ...(["resourceId", "checkIn", "checkOut"].includes(key) ? { ratePlanId: "" } : {}) }));
    setError(null);
    if (key === "resourceId" || key === "checkIn" || key === "checkOut" || key === "ratePlanId" || key === "mode") {
      setPreview(null);
    }
  }

  function openWizard(day?: string, resourceId?: string) {
    wizardTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    if (saving) return;
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
      if (ratePlans.isFetching || ratePlans.isError || !selectedRate) {
        setError("Selecciona un tarifario disponible para esta estadía.");
        return;
      }
      if ((wizard.mode === "MANUAL" || selectedDiscountPercent(wizard) > 0) && !canOverride) { setError("No tienes permiso para ajustar el precio."); return; }
      if (wizard.mode === "MANUAL") {
        const amountMinor = guaraniesToMinor(wizard.agreedAmountMinor);

        if (amountMinor === null || !Number.isSafeInteger(amountMinor)) {
          setError("Ingresá un precio final válido en guaraníes.");
          return;
        }
      }
      const discount = selectedDiscountPercent(wizard);
      if (wizard.mode === "CONFIGURED" && (!Number.isInteger(discount) || discount < 0 || discount > 100)) {
        setError("Elegí un descuento válido.");
        return;
      }
      if (wizard.mode === "CONFIGURED" && !preview) {
        setSaving(true);
        const controller = operation();
        try {
          const result = await calculate.mutateAsync({ resourceId: wizard.resourceId, checkIn: wizard.checkIn, checkOut: wizard.checkOut, signal: controller.signal });
          if (controller.signal.aborted) return;
          setPreview(result);
        } catch (cause) {
          if (controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : "No pudimos calcular la tarifa.");
          return;
        } finally {
          operations.current.delete(controller);
          if (!controller.signal.aborted) setSaving(false);
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
    const phone = normalizePhone(newContact.phone, newContact.country);
    if (!phone) { setError("Ingresa un teléfono válido con país o prefijo internacional."); return; }
    const controller = operation();
    try {
      const contact = await createContact({
        businessId: businessId,
        accessToken,
        signal: controller.signal,
        input: {
          name: newContact.name.trim(),
          lastName: newContact.lastName.trim(),
          phone, whatsapp: phone, country: newContact.country,
          documentType:
            newContact.documentType === "PASSPORT"
              ? "Pasaporte"
              : newContact.documentType === "CI"
                ? "CI"
                : null,
          documentNumber: newContact.documentNumber.trim() || null,
        },
      });

      if (controller.signal.aborted) return;
      await queryClient.invalidateQueries({
        queryKey: ["contacts", businessId],
      });
      if (controller.signal.aborted) return;
      setContactQuery("");
      update("contactId", contact.id);
      setCreatingContact(false);

      setNewContact({
        name: "",
        lastName: "",
        phone: "",
    country: "Paraguay",
        documentType: "",
        documentNumber: "",
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "No pudimos crear el contacto.");
    } finally {
      operations.current.delete(controller);
    }
  }

  async function finishBooking() {
    if (savingLock.current || !businessId || ratePlans.isFetching || ratePlans.isError || !selectedRate || ((wizard.mode === "MANUAL" || selectedDiscountPercent(wizard) > 0) && !canOverride) || (wizard.mode === "CONFIGURED" && !preview)) return;
    savingLock.current = true;
    const controller = operation();
    const discount = selectedDiscountPercent(wizard);
    setSaving(true);
    setError(null);
    try {
      const booking = await createBooking({
        businessId: businessId,
        accessToken,
        signal: controller.signal,
        input: {
          contactId: wizard.contactId,
          resourceIds: [wizard.resourceId],
          checkInDate: wizard.checkIn,
          checkOutDate: wizard.checkOut,
          adults: Number(wizard.adults),
          children: Number(wizard.children),
        },
      });
      if (controller.signal.aborted) return;
      await submitBooking({ businessId: businessId, bookingId: booking.id, accessToken, signal: controller.signal });
      if (controller.signal.aborted) return;
      await confirmBooking({
        businessId: businessId,
        bookingId: booking.id,
        accessToken,
        signal: controller.signal,
        input: {
          pricing: [{
            resourceId: wizard.resourceId,
            ratePlanId: wizard.ratePlanId,
            ...(wizard.mode === "MANUAL"
              ? {
                  agreedAmountMinor: guaraniesToMinor(wizard.agreedAmountMinor) ?? 0,
                  overrideReason: "Precio manual desde calendario",
                }
              : discount > 0
                ? {
                    agreedAmountMinor: Math.round((preview?.totalAmountMinor ?? 0) * (100 - discount) / 100),
                    overrideReason: `Descuento del ${discount}% aplicado desde calendario`,
                  }
                : {}),
          }],
        },
      });
      if (controller.signal.aborted) return;
      await queryClient.invalidateQueries({ queryKey: ["bookings", businessId] });
      if (controller.signal.aborted) return;
      setWizardOpen(false);
      navigate(`/app/bookings/${booking.id}`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "No pudimos confirmar la reserva.");
    } finally {
      operations.current.delete(controller);
      if (!controller.signal.aborted) { savingLock.current = false; setSaving(false); }
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
              const isToday = day === today;
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
                  {formatDateForDisplay(selectedDay)}
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
                      onClick={() => openBooking(item.booking.id)}
                    >
                      <span className="availability-mobile-event-dot" />
                      <span>
                        <strong>{item.resource.name}</strong>
                        <small>
                          {bookingLabels[item.booking.status]}
                          {item.booking.checkInDate && item.booking.checkOutDate
                            ? ` · ${formatDateForDisplay(item.booking.checkInDate)} → ${formatDateForDisplay(item.booking.checkOutDate)}`
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
                const isToday = day === today;
                return <div key={day} className={`availability-calendar-day-head${weekend ? " is-weekend" : ""}${isToday ? " is-today" : ""}`}><span>{new Intl.DateTimeFormat("es-PY", { weekday: "short", timeZone: "UTC" }).format(date).slice(0, 2)}</span><strong>{date.getUTCDate()}</strong></div>;
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
                    return (
                      <CalendarCell
                        key={`${resource.id}-${day}`}
                        day={day}
                        resourceId={resource.id}
                        booking={booking}
                        block={block}
                        free={free}
                        onFreeClick={openWizard}
                        onBookingClick={openBooking}
                      />
                    );
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

      <OverlayPanel open={wizardOpen} label="Nueva reserva" className="booking-wizard" layerClassName="booking-wizard-layer" closeLabel="Cerrar asistente de reserva" triggerRef={wizardTrigger} onClose={closeWizard}>
            <header><div><span>Paso {step} de 5</span><h2 id="booking-wizard-title">Nueva reserva</h2></div><button type="button" aria-label="Cerrar" onClick={closeWizard}><X size={20} /></button></header>
            <div className="booking-wizard-progress" aria-hidden="true">{[1,2,3,4,5].map((item) => <i key={item} className={item <= step ? "is-active" : ""} />)}</div>
            <div className="booking-wizard-body">
              {step === 1 && <StayStep wizard={wizard} update={update} />}
              {step === 2 && <ResourceStep resources={availableResources} selected={wizard.resourceId} loading={stayAvailability.isLoading} onSelect={(id) => update("resourceId", id)} />}
              {step === 3 && <ContactStep contacts={contactsQuery.data ?? []} query={contactQuery} selected={wizard.contactId} creating={creatingContact} newContact={newContact} onQuery={setContactQuery} onSelect={(id) => update("contactId", id)} onToggleCreate={setCreatingContact} onNewContact={setNewContact} onCreate={() => void handleCreateContact()} />}
              {step === 4 && <RateStep canOverride={canOverride} failed={ratePlans.isError} retry={() => void ratePlans.refetch()} wizard={wizard} ratePlans={ratePlans.data ?? []} loading={ratePlans.isLoading || ratePlans.isFetching} preview={preview} update={update} />}
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
              {step < 5 ? <Button type="button" disabled={saving || (step === 1 && stayAvailability.isLoading) || (step === 4 && (ratePlans.isFetching || ratePlans.isError || !selectedRate || (wizard.mode === "MANUAL" && guaraniesToMinor(wizard.agreedAmountMinor) === null) || (wizard.mode === "CONFIGURED" && (wizard.discountPercent === "OTHER" && (!Number.isInteger(Number(wizard.customDiscountPercent)) || Number(wizard.customDiscountPercent) < 1 || Number(wizard.customDiscountPercent) > 100)))))} onClick={() => void nextStep()}>{step === 1 ? "Buscar disponibilidad" : "Continuar"}<ArrowRight size={16} /></Button> : <Button type="button" disabled={saving} onClick={() => void finishBooking()}>{saving ? "Confirmando…" : "Confirmar reserva"}<Check size={16} /></Button>}
            </footer>
      </OverlayPanel>
    </section>
  );
}

function CalendarCell({
  day,
  resourceId,
  booking,
  block,
  free,
  onFreeClick,
  onBookingClick,
}: {
  day: string;
  resourceId: string;
  booking?: Booking;
  block?: Block;
  free: boolean;
  onFreeClick: (
    day?: string,
    resourceId?: string,
  ) => void;
  onBookingClick: (bookingId: string) => void;
}) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekend =
    date.getUTCDay() === 0 || date.getUTCDay() === 6;

  if (booking) {
    return (
      <button
        type="button"
        className={`availability-calendar-cell is-booking is-${booking.status.toLowerCase()}`}
        title={bookingLabels[booking.status]}
        aria-label={`Abrir reserva ${bookingLabels[booking.status]} del ${formatDateForDisplay(day)}`}
        onClick={() => onBookingClick(booking.id)}
      >
        <span>{bookingLabels[booking.status]}</span>
      </button>
    );
  }

  if (block) {
    return (
      <button
        type="button"
        className={`availability-calendar-cell is-block${weekend ? " is-weekend" : ""}`}
        title={block.reason}
      >
        <span>Bloqueo</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`availability-calendar-cell${weekend ? " is-weekend" : ""}${free ? " is-free" : " is-unavailable"}`}
      disabled={!free}
      aria-label={
        free
          ? `Crear reserva para ${formatDateForDisplay(day)}`
          : `No disponible el ${formatDateForDisplay(day)}`
      }
      onClick={() => onFreeClick(day, resourceId)}
    >
      {free && <Plus size={14} />}
    </button>
  );
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
          {value ? formatDateForDisplay(value) : "dd/mm/aaaa"}
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
    country: string;
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
    country: string;
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

          <label>País<select className="top-input" value={newContact.country} onChange={(event) => onNewContact({ ...newContact, country: event.target.value })}>{COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></label>
          <span aria-label="Prefijo internacional">{phonePrefix(newContact.country, newContact.phone)}</span>
          <label>
            Teléfono
            <input
              type="tel" className="top-input"
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
function RateStep({ wizard, ratePlans, loading, failed, retry, canOverride, preview, update }: {
  wizard: WizardState; ratePlans: NonNullable<ReturnType<typeof useSelectableRatePlans>["data"]>;
  loading: boolean; failed: boolean; retry: () => void; canOverride: boolean; preview: CalculatePriceResult | null;
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  const discount = selectedDiscountPercent(wizard);
  const amountError = wizard.agreedAmountMinor && guaraniesToMinor(wizard.agreedAmountMinor) === null ? "Ingresa un monto entero válido en guaraníes." : undefined;
  const configuredTotal = preview ? Math.round(preview.totalAmountMinor * (100 - discount) / 100) : null;
  if (loading) return <p role="status">Buscando planes tarifarios…</p>;
  if (failed) return <div role="alert"><p>No pudimos consultar los tarifarios de esta estadía.</p><Button type="button" variant="secondary" onClick={retry}>Reintentar tarifarios</Button></div>;
  if (!ratePlans.length) return <div className="booking-wizard-empty" role="status"><h3>No hay un tarifario disponible para esta estadía.</h3><p>Se requiere configurar una tarifa para este alojamiento y estas fechas antes de continuar. El precio manual también necesita un tarifario de referencia.</p>{canOverride ? <a href="/app/pricing" target="_blank" rel="noreferrer">Configurar tarifas (nueva pestaña)</a> : <p>Solicita la configuración al propietario o administrador.</p>}<Button type="button" variant="secondary" onClick={retry}>Volver a consultar</Button></div>;
  return <>
    <div className="booking-wizard-heading"><span className="booking-wizard-currency">₲</span><div><h3>Definí la tarifa</h3><p>Elegí un plan válido para esta estadía.</p></div></div>
    <div className="booking-wizard-segments" role="group" aria-label="Modo de precio">
      <Button type="button" variant="secondary" aria-pressed={wizard.mode === "CONFIGURED"} onClick={() => update("mode", "CONFIGURED")}>Configurada</Button>
      {canOverride && <Button type="button" variant="secondary" aria-pressed={wizard.mode === "MANUAL"} onClick={() => update("mode", "MANUAL")}>Manual</Button>}
    </div>
    {wizard.mode === "CONFIGURED" && <div className="booking-wizard-options" role="group" aria-label="Tarifarios disponibles">{ratePlans.map((plan) => <button type="button" key={plan.id} aria-pressed={wizard.ratePlanId === plan.id} className={`top-choice ${wizard.ratePlanId === plan.id ? "is-selected" : ""}`} onClick={() => update("ratePlanId", plan.id)}><span><strong>{plan.name}</strong><small>Base {formatMoney(plan.baseNightlyAmountMinor, plan.currency)}</small></span>{wizard.ratePlanId === plan.id && <Check size={18} aria-hidden="true" />}</button>)}</div>}
    {wizard.mode === "MANUAL" && ratePlans.length > 1 && <label>Plan de referencia<select className="top-input" value={wizard.ratePlanId} onChange={(event) => update("ratePlanId", event.target.value)}><option value="">Selecciona un plan</option>{ratePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>}
    {wizard.mode === "MANUAL" && canOverride ? <div className="booking-wizard-manual-pricing">
      <p className="booking-wizard-manual-helper">Definí el importe final acordado para esta reserva.</p>
      <Input id="manual-agreed-amount" label="Precio final" inputMode="numeric" type="text" value={wizard.agreedAmountMinor} placeholder="0" error={amountError} aria-describedby="manual-amount-help" onChange={(event) => { const digits = event.target.value.replace(/\D/g, ""); update("agreedAmountMinor", digits ? formatManualInput(Number(digits)) : ""); }} />
      <small id="manual-amount-help">Ingresa el total acordado en guaraníes.</small>
    </div> : <div className="booking-wizard-configured-pricing">
      {preview && <div className="booking-wizard-price"><span>Precio de la estadía</span><strong>{formatMoney(preview.totalAmountMinor, preview.currency)}</strong><small>{preview.nights} noches</small></div>}
      {canOverride && <div className="booking-wizard-discount"><Button type="button" variant="tertiary" onClick={() => update("discountPercent", wizard.discountPercent ? "" : "5")}>{wizard.discountPercent ? "Cambiar descuento" : "Aplicar descuento"}</Button>
        {wizard.discountPercent && <div className="booking-wizard-discount-options"><div>{["5", "10", "15", "20", "OTHER"].map((value) => <Button type="button" variant="secondary" key={value} aria-pressed={wizard.discountPercent === value} onClick={() => update("discountPercent", value)}>{value === "OTHER" ? "Otro" : `${value}%`}</Button>)}</div>
          {wizard.discountPercent === "OTHER" && <Input id="booking-discount" label="Porcentaje" type="number" min="1" max="100" step="1" value={wizard.customDiscountPercent} onChange={(event) => update("customDiscountPercent", event.target.value)} />}
          <Button type="button" variant="tertiary" onClick={() => { update("discountPercent", ""); update("customDiscountPercent", ""); }}>Quitar descuento</Button>
        </div>}
      </div>}
      {discount > 0 && configuredTotal !== null && preview && <div className="booking-wizard-discount-summary"><span>Original</span><strong>{formatMoney(preview.totalAmountMinor, preview.currency)}</strong><span>Descuento ({discount}%)</span><strong>−{formatMoney(preview.totalAmountMinor - configuredTotal, preview.currency)}</strong><span>Precio final</span><strong>{formatMoney(configuredTotal, preview.currency)}</strong></div>}
    </div>}
  </>;
}

function ReviewStep({ wizard, resourceName, contactName, rateName, preview }: { wizard: WizardState; resourceName?: string; contactName?: string; rateName?: string; preview: CalculatePriceResult | null }) {
  const discount = selectedDiscountPercent(wizard);
  const total = wizard.mode === "MANUAL" ? guaraniesToMinor(wizard.agreedAmountMinor) ?? 0 : preview ? Math.round(preview.totalAmountMinor * (100 - discount) / 100) : 0;
  return <><div className="booking-wizard-heading"><Check size={22} /><div><h3>Revisá y confirmá</h3><p>TOP volverá a validar disponibilidad y precio al confirmar.</p></div></div><dl className="booking-wizard-review"><div><dt>Contacto</dt><dd>{contactName}</dd></div><div><dt>Alojamiento</dt><dd>{resourceName}</dd></div><div><dt>Estadía</dt><dd>{formatDateForDisplay(wizard.checkIn)} → {formatDateForDisplay(wizard.checkOut)}</dd></div><div><dt>Huéspedes</dt><dd>{wizard.adults} adultos · {wizard.children} niños</dd></div><div><dt>Tarifa</dt><dd>{rateName}{wizard.mode === "MANUAL" ? " · ajuste manual" : ""}</dd></div><div className="is-total"><dt>Total acordado</dt><dd>{formatMoney(total, preview?.currency)}</dd></div></dl></>;
}
