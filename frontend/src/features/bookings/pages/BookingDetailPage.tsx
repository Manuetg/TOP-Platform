import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Mail,
  Phone,
  Pencil,
  UserRound,
  Users,
  Send,
  XCircle,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useContacts } from "../../contacts/queries/use-contacts";
import { useResources } from "../../resources/queries/use-resources";
import { useBooking } from "../queries/use-booking";
import { useSubmitBooking } from "../queries/use-submit-booking";
import { useCancelBooking } from "../queries/use-cancel-booking";
import { BookingTimeline } from "../components/BookingTimeline";
import type { BookingStatus } from "../types/booking.types";
import "./BookingDetailPage.css";

interface BookingDetailPageProps {
  businessId?: string;
}


const STATUS_LABELS: Record<
  BookingStatus,
  string
> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No show",
};

function BookingStatusBadge({
  status,
}: {
  status: BookingStatus;
}) {
  return (
    <span
      className={`booking-detail-status booking-detail-status--${status.toLowerCase()}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin definir";
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(
    new Date(year, month - 1, day),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortBookingId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function formatGuestCount(
  value: number | null,
  singular: string,
  plural: string,
) {
  if (value === null) {
    return "Sin definir";
  }

  return `${value} ${
    value === 1 ? singular : plural
  }`;
}

export function BookingDetailPage({
  businessId: suppliedBusinessId,
}: BookingDetailPageProps) {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;

  const {
    data: booking,
    isLoading,
    isError,
    error,
    refetch,
  } = useBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const submitMutation = useSubmitBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const cancelMutation = useCancelBooking({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const [showCancel, setShowCancel] =
    useState(false);
  const [cancelReason, setCancelReason] =
    useState("");
  const [
    cancelValidationError,
    setCancelValidationError,
  ] = useState<string | null>(null);

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

  const contact = useMemo(
    () =>
      booking?.contactId
        ? (contacts ?? []).find(
            (item) =>
              item.id === booking.contactId,
          )
        : undefined,
    [booking, contacts],
  );

  const bookingResources = useMemo(
    () =>
      booking
        ? booking.resourceIds
            .map((id) =>
              (resources ?? []).find(
                (resource) =>
                  resource.id === id,
              ),
            )
            .filter(
              (
                resource,
              ): resource is NonNullable<
                typeof resource
              > => Boolean(resource),
            )
        : [],
    [booking, resources],
  );

  async function handleSubmitBooking() {
    submitMutation.reset();

    try {
      await submitMutation.mutateAsync();
    } catch {
      // El error se presenta desde la mutación.
    }
  }

  async function handleCancelBooking() {
    const reason = cancelReason.trim();

    if (
      reason.length > 0 &&
      reason.length < 2
    ) {
      setCancelValidationError(
        "El motivo debe tener al menos 2 caracteres.",
      );
      return;
    }

    if (reason.length > 500) {
      setCancelValidationError(
        "El motivo puede tener como máximo 500 caracteres.",
      );
      return;
    }

    setCancelValidationError(null);
    cancelMutation.reset();

    try {
      await cancelMutation.mutateAsync(
        reason || undefined,
      );

      setShowCancel(false);
      setCancelReason("");
    } catch {
      // El error se presenta desde la mutación.
    }
  }

  const loading =
    isLoading ||
    contactsLoading ||
    resourcesLoading;

  if (loading) {
    return (
      <section
        className="booking-detail-page"
        aria-busy="true"
      >
        <div className="booking-detail-state">
          <div
            className="booking-detail-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>Cargando reserva</h1>
          <p>
            Estamos preparando el detalle de la
            reserva.
          </p>
        </div>
      </section>
    );
  }

  if (isError || !booking) {
    return (
      <section className="booking-detail-page">
        <div
          className="booking-detail-state"
          role="alert"
        >
          <div
            className="booking-detail-state__icon"
            aria-hidden="true"
          >
            <ClipboardList size={28} />
          </div>

          <h1>
            No pudimos cargar la reserva
          </h1>

          <p>
            {error instanceof Error
              ? error.message
              : "La reserva no está disponible."}
          </p>

          <div className="booking-detail-state__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate("/app/bookings")
              }
            >
              Volver
            </Button>

            <Button
              type="button"
              onClick={() => void refetch()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="booking-detail-page">
      <button
        type="button"
        className="booking-detail-back"
        onClick={() =>
          navigate("/app/bookings")
        }
      >
        <ArrowLeft
          size={18}
          aria-hidden="true"
        />
        Reservas
      </button>

      <header className="booking-detail-header">
        <div>
          <span className="booking-detail-eyebrow">
            Reserva
          </span>

          <div className="booking-detail-title-row">
            <h1>
              {shortBookingId(booking.id)}
            </h1>

            <BookingStatusBadge
              status={booking.status}
            />
          </div>

          <p>
            Creada el{" "}
            {formatDateTime(
              booking.createdAt,
            )}
          </p>
        </div>

        <div className="booking-detail-header-actions">
          {booking.status === "DRAFT" && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  submitMutation.isPending ||
                  cancelMutation.isPending
                }
                onClick={() =>
                  navigate(
                    `/app/bookings/${booking.id}/edit`,
                  )
                }
              >
                <Pencil
                  size={16}
                  aria-hidden="true"
                />
                Editar borrador
              </Button>

              <Button
                type="button"
                disabled={
                  submitMutation.isPending ||
                  cancelMutation.isPending
                }
                onClick={() =>
                  void handleSubmitBooking()
                }
              >
                <Send
                  size={16}
                  aria-hidden="true"
                />
                {submitMutation.isPending
                  ? "Enviando..."
                  : "Enviar reserva"}
              </Button>
            </>
          )}
          {booking.status === "PENDING" && (
            <Button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() =>
                navigate(
                  `/app/bookings/${booking.id}/confirm`,
                )
              }
            >
              Confirmar reserva
            </Button>
          )}


          {(
            booking.status === "DRAFT" ||
            booking.status === "PENDING" ||
            booking.status === "CONFIRMED"
          ) && (
            <Button
              type="button"
              variant="secondary"
              disabled={
                submitMutation.isPending ||
                cancelMutation.isPending
              }
              onClick={() => {
                cancelMutation.reset();
                setCancelValidationError(null);
                setShowCancel(true);
              }}
            >
              <XCircle
                size={16}
                aria-hidden="true"
              />
              Cancelar reserva
            </Button>
          )}
        </div>
      </header>

      {showCancel && (
        <section
          className="booking-detail-cancel"
          aria-labelledby="cancel-booking-title"
        >
          <div>
            <h2 id="cancel-booking-title">
              Cancelar reserva
            </h2>

            <p>
              La cancelación conserva la reserva
              y su historial. Esta acción no
              elimina información.
            </p>
          </div>

          <div className="booking-detail-cancel__field">
            <label htmlFor="booking-cancel-reason">
              Motivo
              <span> Opcional</span>
            </label>

            <textarea
              id="booking-cancel-reason"
              rows={3}
              maxLength={500}
              value={cancelReason}
              onChange={(event) => {
                setCancelReason(
                  event.target.value,
                );
                setCancelValidationError(null);
              }}
              placeholder="Ej. Cambio de planes del huésped"
            />

            <div className="booking-detail-cancel__meta">
              <span>
                {cancelValidationError ?? ""}
              </span>
              <span>
                {cancelReason.length}/500
              </span>
            </div>
          </div>

          {cancelMutation.isError && (
            <div
              className="booking-detail-submit-error"
              role="alert"
            >
              {cancelMutation.error
                instanceof Error
                ? cancelMutation.error.message
                : "No pudimos cancelar la reserva."}
            </div>
          )}

          <div className="booking-detail-cancel__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={cancelMutation.isPending}
              onClick={() => {
                setShowCancel(false);
                setCancelReason("");
                setCancelValidationError(null);
                cancelMutation.reset();
              }}
            >
              Volver
            </Button>

            <Button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() =>
                void handleCancelBooking()
              }
            >
              {cancelMutation.isPending
                ? "Cancelando..."
                : "Confirmar cancelación"}
            </Button>
          </div>
        </section>
      )}

      {submitMutation.isError && (
        <div
          className="booking-detail-submit-error"
          role="alert"
        >
          {submitMutation.error
            instanceof Error
            ? submitMutation.error.message
            : "No pudimos enviar la reserva."}
        </div>
      )}

      <div className="booking-detail-grid">
        <div className="booking-detail-main">
          <section className="booking-detail-card">
            <div className="booking-detail-card__header">
              <div
                className="booking-detail-card__icon"
                aria-hidden="true"
              >
                <CalendarDays size={20} />
              </div>

              <div>
                <h2>Estadía</h2>
                <p>
                  Fechas y recursos reservados.
                </p>
              </div>
            </div>

            <dl className="booking-detail-fields booking-detail-fields--dates">
              <div>
                <dt>Entrada</dt>
                <dd>
                  {formatDate(
                    booking.checkInDate,
                  )}
                </dd>
              </div>

              <div>
                <dt>Salida</dt>
                <dd>
                  {formatDate(
                    booking.checkOutDate,
                  )}
                </dd>
              </div>
            </dl>

            <div className="booking-detail-resources">
              <span className="booking-detail-label">
                Recursos
              </span>

              {booking.resourceIds.length ===
              0 ? (
                <p className="booking-detail-empty-value">
                  Sin recursos asignados
                </p>
              ) : (
                <div className="booking-detail-resource-list">
                  {booking.resourceIds.map(
                    (resourceId) => {
                      const resource =
                        bookingResources.find(
                          (item) =>
                            item.id ===
                            resourceId,
                        );

                      return (
                        <div
                          key={resourceId}
                          className="booking-detail-resource"
                        >
                          <strong>
                            {resource?.name ??
                              "Recurso no disponible"}
                          </strong>

                          {resource && (
                            <span>
                              {
                                resource.internalCode
                              }
                            </span>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="booking-detail-card">
            <div className="booking-detail-card__header">
              <div
                className="booking-detail-card__icon"
                aria-hidden="true"
              >
                <Users size={20} />
              </div>

              <div>
                <h2>Huéspedes</h2>
                <p>
                  Ocupación registrada para la
                  estadía.
                </p>
              </div>
            </div>

            <dl className="booking-detail-fields">
              <div>
                <dt>Adultos</dt>
                <dd>
                  {formatGuestCount(
                    booking.adults,
                    "adulto",
                    "adultos",
                  )}
                </dd>
              </div>

              <div>
                <dt>Niños</dt>
                <dd>
                  {formatGuestCount(
                    booking.children,
                    "niño",
                    "niños",
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="booking-detail-card">
            <div className="booking-detail-card__header">
              <div
                className="booking-detail-card__icon"
                aria-hidden="true"
              >
                <ClipboardList size={20} />
              </div>

              <div>
                <h2>Notas</h2>
                <p>
                  Información adicional de la
                  reserva.
                </p>
              </div>
            </div>

            {booking.notes ? (
              <p className="booking-detail-notes">
                {booking.notes}
              </p>
            ) : (
              <p className="booking-detail-empty-value">
                Sin notas
              </p>
            )}
          </section>
        </div>

        <aside className="booking-detail-sidebar">
          <section className="booking-detail-card">
            <div className="booking-detail-card__header">
              <div
                className="booking-detail-card__icon"
                aria-hidden="true"
              >
                <UserRound size={20} />
              </div>

              <div>
                <h2>Contacto</h2>
                <p>
                  Responsable asociado a la
                  reserva.
                </p>
              </div>
            </div>

            {!booking.contactId ? (
              <p className="booking-detail-empty-value">
                Sin contacto asignado
              </p>
            ) : contact ? (
              <div className="booking-detail-contact">
                <strong>
                  {contact.fullName}
                </strong>

                {contact.phone && (
                  <span>
                    <Phone
                      size={15}
                      aria-hidden="true"
                    />
                    {contact.phone}
                  </span>
                )}

                {contact.email && (
                  <span>
                    <Mail
                      size={15}
                      aria-hidden="true"
                    />
                    {contact.email}
                  </span>
                )}
              </div>
            ) : (
              <p className="booking-detail-empty-value">
                Contacto no disponible
              </p>
            )}
          </section>

          <section className="booking-detail-card">
            <h2>Información</h2>

            <dl className="booking-detail-meta">
              <div>
                <dt>ID</dt>
                <dd>{booking.id}</dd>
              </div>

              <div>
                <dt>Creada</dt>
                <dd>
                  {formatDateTime(
                    booking.createdAt,
                  )}
                </dd>
              </div>

              <div>
                <dt>Última actualización</dt>
                <dd>
                  {formatDateTime(
                    booking.updatedAt,
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <BookingTimeline
        businessId={businessId}
        bookingId={booking.id}
      />
    </section>
  );
}
