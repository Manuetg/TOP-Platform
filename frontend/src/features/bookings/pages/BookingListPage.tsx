import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useContacts } from "../../contacts/queries/use-contacts";
import { useResources } from "../../resources/queries/use-resources";
import { useBookings } from "../queries/use-bookings";
import type {
  Booking,
  BookingStatus,
} from "../types/booking.types";
import "./BookingListPage.css";

interface BookingListPageProps {
  businessId?: string;
}


const ALL = "ALL";

type StatusFilter = BookingStatus | typeof ALL;

const STATUS_OPTIONS: Array<{
  value: BookingStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Borrador" },
  { value: "PENDING", label: "Pendiente" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "IN_PROGRESS", label: "En curso" },
  { value: "COMPLETED", label: "Completada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "NO_SHOW", label: "No show" },
];

function getStatusLabel(
  status: BookingStatus,
) {
  return (
    STATUS_OPTIONS.find(
      (option) => option.value === status,
    )?.label ?? status
  );
}

function BookingStatusBadge({
  status,
}: {
  status: BookingStatus;
}) {
  return (
    <span
      className={`booking-list-status booking-list-status--${status.toLowerCase()}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function formatStay(
  checkInDate: string | null,
  checkOutDate: string | null,
) {
  if (!checkInDate || !checkOutDate) {
    return "Fechas pendientes";
  }

  const formatCompact = (value: string) => {
    const [year, month, day] = value
      .split("-")
      .map(Number);

    return new Intl.DateTimeFormat("es-PY", {
      day: "2-digit",
      month: "short",
    }).format(
      new Date(year, month - 1, day),
    );
  };

  return `${formatCompact(
    checkInDate,
  )} → ${formatCompact(checkOutDate)}`;
}

function formatOccupancy(
  adults: number | null,
  children: number | null,
) {
  if (adults === null && children === null) {
    return "Sin definir";
  }

  const parts: string[] = [];

  if (adults !== null) {
    parts.push(
      `${adults} ${
        adults === 1 ? "adulto" : "adultos"
      }`,
    );
  }

  if (children !== null && children > 0) {
    parts.push(
      `${children} ${
        children === 1 ? "niño" : "niños"
      }`,
    );
  }

  return parts.length > 0
    ? parts.join(" · ")
    : "0 huéspedes";
}

function shortBookingId(id: string) {
  return id.length > 8
    ? id.slice(0, 8).toUpperCase()
    : id.toUpperCase();
}

interface BookingRowProps {
  booking: Booking;
  contactName: string;
  resourceNames: string[];
  onOpen: (bookingId: string) => void;
}

function BookingRow({
  booking,
  contactName,
  resourceNames,
  onOpen,
}: BookingRowProps) {
  return (
    <button
      type="button"
      className="booking-list-row"
      onClick={() => onOpen(booking.id)}
      aria-label={`Abrir reserva ${shortBookingId(
        booking.id,
      )}`}
    >
      <div className="booking-list-row__booking">
        <strong>
          {shortBookingId(booking.id)}
        </strong>
        <span>
          {booking.resourceIds.length}{" "}
          {booking.resourceIds.length === 1
            ? "alojamiento"
            : "alojamientos"}
        </span>
      </div>

      <strong className="booking-list-row__contact">
        {contactName}
      </strong>

      <div className="booking-list-row__stay">
        <strong>
          {resourceNames.length > 0
            ? resourceNames.join(", ")
            : "Sin recurso"}
        </strong>
        <span>
          {formatStay(
            booking.checkInDate,
            booking.checkOutDate,
          )}
        </span>
      </div>

      <span className="booking-list-row__occupancy">
        {formatOccupancy(
          booking.adults,
          booking.children,
        )}
      </span>

      <BookingStatusBadge
        status={booking.status}
      />
    </button>
  );
}

function BookingCard({
  booking,
  contactName,
  resourceNames,
  onOpen,
}: BookingRowProps) {
  return (
    <button
      type="button"
      className="booking-list-card"
      onClick={() => onOpen(booking.id)}
      aria-label={`Abrir reserva ${shortBookingId(
        booking.id,
      )}`}
    >
      <div className="booking-list-card__header">
        <strong>
          {shortBookingId(booking.id)}
        </strong>

        <BookingStatusBadge
          status={booking.status}
        />
      </div>

      <div className="booking-list-card__contact">
        {contactName}
      </div>

      <div className="booking-list-card__stay">
        <CalendarDays
          size={17}
          aria-hidden="true"
        />

        <span>
          <strong>
            {resourceNames.length > 0
              ? resourceNames.join(", ")
              : "Sin recurso"}
          </strong>

          {formatStay(
            booking.checkInDate,
            booking.checkOutDate,
          )}
        </span>
      </div>

      <div className="booking-list-card__occupancy">
        <Users
          size={17}
          aria-hidden="true"
        />

        {formatOccupancy(
          booking.adults,
          booking.children,
        )}
      </div>
    </button>
  );
}

export function BookingListPage({
  businessId: suppliedBusinessId,
}: BookingListPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;

  const [status, setStatus] =
    useState<StatusFilter>(ALL);
  const [contactId, setContactId] =
    useState("");
  const [resourceId, setResourceId] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const {
    data: bookings,
    isLoading,
    isError,
    error,
    refetch,
  } = useBookings({
    businessId,
    status:
      status === ALL ? undefined : status,
    contactId: contactId || undefined,
    resourceId: resourceId || undefined,
    accessToken: session?.accessToken,
  });

  const {
    data: contacts,
    isLoading: contactsLoading,
  } = useContacts({
    businessId,
    accessToken: session?.accessToken,
  });

  const {
    data: resources,
    isLoading: resourcesLoading,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const contactById = useMemo(
    () =>
      new Map(
        (contacts ?? []).map((contact) => [
          contact.id,
          contact.fullName,
        ]),
      ),
    [contacts],
  );

  const resourceById = useMemo(
    () =>
      new Map(
        (resources ?? []).map((resource) => [
          resource.id,
          resource.name,
        ]),
      ),
    [resources],
  );

  const visibleBookings = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLocaleLowerCase("es");

    if (!normalizedSearch) {
      return bookings ?? [];
    }

    return (bookings ?? []).filter(
      (booking) => {
        const contactName =
          booking.contactId
            ? contactById.get(
                booking.contactId,
              ) ?? ""
            : "";

        const resourceNames =
          booking.resourceIds
            .map(
              (id) =>
                resourceById.get(id) ?? "",
            )
            .join(" ");

        const searchable = [
          booking.id,
          contactName,
          resourceNames,
          booking.status,
          booking.checkInDate ?? "",
          booking.checkOutDate ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("es");

        return searchable.includes(
          normalizedSearch,
        );
      },
    );
  }, [
    bookings,
    search,
    contactById,
    resourceById,
  ]);

  const hasFilters =
    status !== ALL ||
    contactId.length > 0 ||
    resourceId.length > 0 ||
    search.trim().length > 0;

  function clearFilters() {
    setStatus(ALL);
    setContactId("");
    setResourceId("");
    setSearch("");
  }

  const loading =
    isLoading ||
    contactsLoading ||
    resourcesLoading;

  if (loading) {
    return (
      <section
        className="booking-list-page"
        aria-busy="true"
      >
        <div className="booking-list-state">
          <div
            className="booking-list-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>Cargando reservas</h1>
          <p>
            Estamos preparando las reservas del
            Business.
          </p>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="booking-list-page">
        <div
          className="booking-list-state"
          role="alert"
        >
          <div
            className="booking-list-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>
            No pudimos cargar las reservas
          </h1>

          <p>
            {error instanceof Error
              ? error.message
              : "Ocurrió un error inesperado."}
          </p>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void refetch()}
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="booking-list-page">
      <header className="booking-list-header">
        <div>
          <h1>Reservas</h1>
          <p>
            Centro operativo de la estadía.
          </p>
        </div>

        <Button
          type="button"
          className="booking-list-header__create"
          onClick={() =>
            navigate("/app/bookings/new")
          }
        >
          <Plus
            size={18}
            aria-hidden="true"
          />
          Crear reserva
        </Button>
      </header>

      <button
        type="button"
        className="booking-list-filters-toggle"
        aria-expanded={filtersOpen}
        aria-controls="booking-list-filters"
        onClick={() =>
          setFiltersOpen(
            (current) => !current,
          )
        }
      >
        <span>
          <SlidersHorizontal
            size={18}
            aria-hidden="true"
          />
          Buscar o filtrar reservas
        </span>

        {hasFilters && (
          <span className="booking-list-filters-toggle__active">
            Activos
          </span>
        )}

        <ChevronDown
          size={18}
          aria-hidden="true"
          className={
            filtersOpen
              ? "booking-list-filters-toggle__chevron booking-list-filters-toggle__chevron--open"
              : "booking-list-filters-toggle__chevron"
          }
        />
      </button>

      <div
        id="booking-list-filters"
        className={
          filtersOpen
            ? "booking-list-filters booking-list-filters--open"
            : "booking-list-filters"
        }
        aria-label="Filtros de reservas"
      >
        <div className="booking-list-search">
          <Search
            size={18}
            aria-hidden="true"
          />

          <input
            type="search"
            aria-label="Buscar reservas"
            placeholder="Buscar por huésped, recurso o reserva"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="booking-list-field">
          <label htmlFor="booking-status">
            Estado
          </label>

          <select
            id="booking-status"
            value={status}
            onChange={(event) =>
              setStatus(
                event.target
                  .value as StatusFilter,
              )
            }
          >
            <option value={ALL}>
              Todos
            </option>

            {STATUS_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="booking-list-field">
          <label htmlFor="booking-contact">
            Contacto
          </label>

          <select
            id="booking-contact"
            value={contactId}
            onChange={(event) =>
              setContactId(
                event.target.value,
              )
            }
          >
            <option value="">
              Todos los contactos
            </option>

            {(contacts ?? []).map(
              (contact) => (
                <option
                  key={contact.id}
                  value={contact.id}
                >
                  {contact.fullName}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="booking-list-field">
          <label htmlFor="booking-resource">
            Recurso
          </label>

          <select
            id="booking-resource"
            value={resourceId}
            onChange={(event) =>
              setResourceId(
                event.target.value,
              )
            }
          >
            <option value="">
              Todos los recursos
            </option>

            {(resources ?? []).map(
              (resource) => (
                <option
                  key={resource.id}
                  value={resource.id}
                >
                  {resource.name}
                </option>
              ),
            )}
          </select>
        </div>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            className="booking-list-filters__clear"
            onClick={clearFilters}
          >
            <RotateCcw
              size={17}
              aria-hidden="true"
            />
            Limpiar
          </Button>
        )}
      </div>

      {visibleBookings.length === 0 ? (
        <div className="booking-list-state booking-list-state--empty">
          <div
            className="booking-list-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h2>
            {hasFilters
              ? "No encontramos reservas"
              : "Todavía no hay reservas"}
          </h2>

          <p>
            {hasFilters
              ? "Probá cambiando o limpiando los filtros."
              : "Creá la primera reserva para comenzar a gestionar estadías."}
          </p>

          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={clearFilters}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="booking-list-table">
            <div
              className="booking-list-table__header"
              aria-hidden="true"
            >
              <span>Reserva</span>
              <span>Contacto</span>
              <span>Estadía</span>
              <span>Ocupación</span>
              <span>Estado</span>
            </div>

            <div className="booking-list-table__body">
              {visibleBookings.map(
                (booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    contactName={
                      booking.contactId
                        ? contactById.get(
                            booking.contactId,
                          ) ??
                          "Contacto no disponible"
                        : "Sin contacto"
                    }
                    resourceNames={booking.resourceIds
                      .map((id) =>
                        resourceById.get(id),
                      )
                      .filter(
                        (
                          name,
                        ): name is string =>
                          Boolean(name),
                      )}
                    onOpen={(bookingId) =>
                      navigate(
                        `/app/bookings/${bookingId}`,
                      )
                    }
                  />
                ),
              )}
            </div>
          </div>

          <div className="booking-list-cards">
            {visibleBookings.map(
              (booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  contactName={
                    booking.contactId
                      ? contactById.get(
                          booking.contactId,
                        ) ??
                        "Contacto no disponible"
                      : "Sin contacto"
                  }
                  resourceNames={booking.resourceIds
                    .map((id) =>
                      resourceById.get(id),
                    )
                    .filter(
                      (
                        name,
                      ): name is string =>
                        Boolean(name),
                    )}
                  onOpen={(bookingId) =>
                    navigate(
                      `/app/bookings/${bookingId}`,
                    )
                  }
                />
              ),
            )}
          </div>
        </>
      )}
    </section>
  );
}
