import {
  CheckCircle2,
  Circle,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBookingTimeline } from "../queries/use-booking-timeline";
import type {
  BookingTimelineEventType,
  BookingTimelineItem,
} from "../types/booking.types";

interface BookingTimelineProps {
  businessId: string;
  bookingId: string;
}

const EVENT_LABELS: Record<
  BookingTimelineEventType,
  string
> = {
  BOOKING_CREATED: "Reserva creada",
  BOOKING_SUBMITTED: "Reserva enviada",
  BOOKING_CONFIRMED: "Reserva confirmada",
  BOOKING_CANCELLED: "Reserva cancelada",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EventIcon({
  type,
}: {
  type: BookingTimelineEventType;
}) {
  switch (type) {
    case "BOOKING_SUBMITTED":
      return (
        <Send
          size={16}
          aria-hidden="true"
        />
      );

    case "BOOKING_CONFIRMED":
      return (
        <CheckCircle2
          size={16}
          aria-hidden="true"
        />
      );

    case "BOOKING_CANCELLED":
      return (
        <XCircle
          size={16}
          aria-hidden="true"
        />
      );

    case "BOOKING_CREATED":
    default:
      return (
        <Circle
          size={16}
          aria-hidden="true"
        />
      );
  }
}

function TimelineItem({
  item,
}: {
  item: BookingTimelineItem;
}) {
  return (
    <li className="booking-timeline-item">
      <div
        className="booking-timeline-item__icon"
        aria-hidden="true"
      >
        <EventIcon type={item.type} />
      </div>

      <div className="booking-timeline-item__content">
        <div className="booking-timeline-item__header">
          <strong>
            {EVENT_LABELS[item.type]}
          </strong>

          <time dateTime={item.occurredAt}>
            {formatDateTime(item.occurredAt)}
          </time>
        </div>

        {item.details.reason && (
          <p>
            Motivo: {item.details.reason}
          </p>
        )}

        {item.actor?.userId && (
          <span className="booking-timeline-item__actor">
            Usuario: {item.actor.userId}
          </span>
        )}
      </div>
    </li>
  );
}

export function BookingTimeline({
  businessId,
  bookingId,
}: BookingTimelineProps) {
  const { session } = useAuth();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBookingTimeline({
    businessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const items =
    data?.pages.flatMap(
      (page) => page.items,
    ) ?? [];

  if (isLoading) {
    return (
      <section
        className="booking-detail-card"
        aria-busy="true"
      >
        <h2>Historial</h2>
        <p className="booking-detail-empty-value">
          Cargando historial...
        </p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="booking-detail-card">
        <h2>Historial</h2>

        <div
          className="booking-detail-submit-error"
          role="alert"
        >
          {error instanceof Error
            ? error.message
            : "No pudimos cargar el historial."}
        </div>

        <div className="booking-timeline-retry">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void refetch()
            }
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="booking-detail-card">
      <div className="booking-detail-card__header">
        <div>
          <h2>Historial</h2>
          <p>
            Eventos registrados para esta reserva.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="booking-detail-empty-value">
          Todavía no hay eventos registrados.
        </p>
      ) : (
        <ol className="booking-timeline-list">
          {items.map((item) => (
            <TimelineItem
              key={item.id}
              item={item}
            />
          ))}
        </ol>
      )}

      {hasNextPage && (
        <div className="booking-timeline-more">
          <Button
            type="button"
            variant="secondary"
            disabled={isFetchingNextPage}
            onClick={() =>
              void fetchNextPage()
            }
          >
            {isFetchingNextPage
              ? "Cargando..."
              : "Ver más eventos"}
          </Button>
        </div>
      )}
    </section>
  );
}