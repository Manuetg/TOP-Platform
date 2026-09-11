import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  UserRound,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useContacts } from "../../contacts/queries/use-contacts";
import { useResources } from "../../resources/queries/use-resources";
import type { CreateBookingInput } from "../types/booking.types";

export interface BookingDraftFormInitialValues {
  contactId: string;
  resourceId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: string;
  children: string;
  notes: string;
}

interface BookingDraftFormProps {
  businessId: string;
  initialValues?: BookingDraftFormInitialValues;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  errorMessage?: string | null;
  onSubmit: (
    input: CreateBookingInput,
  ) => Promise<void>;
  onCancel: () => void;
}

interface ValidationErrors {
  dates?: string;
  adults?: string;
  children?: string;
  childrenCapacity?: string;
  capacity?: string;
  notes?: string;
}

const EMPTY_VALUES: BookingDraftFormInitialValues = {
  contactId: "",
  resourceId: "",
  checkInDate: "",
  checkOutDate: "",
  adults: "",
  children: "",
  notes: "",
};

function parseOptionalCount(
  value: string,
): number | null {
  if (value.trim() === "") {
    return null;
  }

  return Number(value);
}

export function BookingDraftForm({
  businessId,
  initialValues = EMPTY_VALUES,
  submitLabel,
  pendingLabel,
  isPending,
  errorMessage,
  onSubmit,
  onCancel,
}: BookingDraftFormProps) {
  const { session } = useAuth();

  const [contactId, setContactId] =
    useState(initialValues.contactId);
  const [resourceId, setResourceId] =
    useState(initialValues.resourceId);
  const [checkInDate, setCheckInDate] =
    useState(initialValues.checkInDate);
  const [checkOutDate, setCheckOutDate] =
    useState(initialValues.checkOutDate);
  const [adults, setAdults] =
    useState(initialValues.adults);
  const [children, setChildren] =
    useState(initialValues.children);
  const [notes, setNotes] =
    useState(initialValues.notes);

  const [
    validationErrors,
    setValidationErrors,
  ] = useState<ValidationErrors>({});

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

  const selectableResources = useMemo(
    () =>
      (resources ?? []).filter(
        (resource) =>
          resource.status !== "ARCHIVED",
      ),
    [resources],
  );

  const selectedResource = useMemo(
    () =>
      selectableResources.find(
        (resource) =>
          resource.id === resourceId,
      ),
    [
      resourceId,
      selectableResources,
    ],
  );

  function validate() {
    const next: ValidationErrors = {};

    if (
      checkInDate &&
      checkOutDate &&
      checkOutDate <= checkInDate
    ) {
      next.dates =
        "La fecha de salida debe ser posterior a la fecha de entrada.";
    }

    if (adults.trim() !== "") {
      const parsed = Number(adults);

      if (
        !Number.isInteger(parsed) ||
        parsed < 0
      ) {
        next.adults =
          "Adultos debe ser un número entero igual o mayor que 0.";
      }
    }

    if (children.trim() !== "") {
      const parsed = Number(children);

      if (
        !Number.isInteger(parsed) ||
        parsed < 0
      ) {
        next.children =
          "Niños debe ser un número entero igual o mayor que 0.";
      }
    }

    if (
      selectedResource &&
      children.trim() !== ""
    ) {
      const childCount = Number(children);

      if (
        Number.isInteger(childCount) &&
        childCount >= 0 &&
        childCount >
          selectedResource.capacityMaximumChildren
      ) {
        next.childrenCapacity =
          `Este alojamiento admite como máximo ${selectedResource.capacityMaximumChildren} niño${
            selectedResource.capacityMaximumChildren === 1
              ? ""
              : "s"
          }.`;
      }
    }

    if (
      selectedResource &&
      adults.trim() !== "" &&
      children.trim() !== ""
    ) {
      const adultCount = Number(adults);
      const childCount = Number(children);

      if (
        Number.isInteger(adultCount) &&
        adultCount >= 0 &&
        Number.isInteger(childCount) &&
        childCount >= 0 &&
        adultCount + childCount >
          selectedResource.capacityMaximum
      ) {
        next.capacity =
          `La ocupación supera la capacidad máxima de ${selectedResource.capacityMaximum} huéspedes para ${selectedResource.name}.`;
      }
    }

    if (notes.trim().length > 1000) {
      next.notes =
        "Las notas pueden tener como máximo 1000 caracteres.";
    }

    setValidationErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    await onSubmit({
      contactId:
        contactId || null,
      resourceIds:
        resourceId
          ? [resourceId]
          : [],
      checkInDate:
        checkInDate || null,
      checkOutDate:
        checkOutDate || null,
      adults:
        parseOptionalCount(adults),
      children:
        parseOptionalCount(children),
      notes:
        notes.trim() || null,
    });
  }

  if (
    contactsLoading ||
    resourcesLoading
  ) {
    return (
      <div
        className="create-booking-state"
        aria-busy="true"
      >
        <div
          className="create-booking-state__icon"
          aria-hidden="true"
        >
          <ClipboardList size={28} />
        </div>

        <h1>Preparando la reserva</h1>
        <p>
          Estamos cargando contactos y
          alojamientos.
        </p>
      </div>
    );
  }

  return (
    <form
      className="create-booking-form"
      onSubmit={(event) =>
        void handleSubmit(event)
      }
      noValidate
    >
      <div className="create-booking-main">
        <section className="create-booking-card">
          <div className="create-booking-card__header">
            <div
              className="create-booking-card__icon"
              aria-hidden="true"
            >
              <UserRound size={20} />
            </div>

            <div>
              <h2>Contacto</h2>
              <p>
                Responsable de la reserva.
              </p>
            </div>
          </div>

          <div className="create-booking-field">
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
                Sin contacto por ahora
              </option>

              {(contacts ?? []).map(
                (contact) => (
                  <option
                    key={contact.id}
                    value={contact.id}
                  >
                    {contact.fullName}
                    {contact.status !==
                    "ACTIVE"
                      ? ` — ${contact.status}`
                      : ""}
                  </option>
                ),
              )}
            </select>

            <span className="create-booking-hint">
              El contacto puede completarse mientras
              la reserva siga en borrador.
            </span>
          </div>
        </section>

        <section className="create-booking-card">
          <div className="create-booking-card__header">
            <div
              className="create-booking-card__icon"
              aria-hidden="true"
            >
              <BedDouble size={20} />
            </div>

            <div>
              <h2>Alojamiento</h2>
              <p>
                Recurso asociado a la reserva.
              </p>
            </div>
          </div>

          <div className="create-booking-field">
            <label htmlFor="booking-resource">
              Alojamiento
            </label>

            <select
              id="booking-resource"
              value={resourceId}
              onChange={(event) => {
                setResourceId(
                  event.target.value,
                );

                setValidationErrors(
                  (current) => ({
                    ...current,
                    childrenCapacity: undefined,
                    capacity: undefined,
                  }),
                );
              }}
            >
              <option value="">
                Sin alojamiento por ahora
              </option>

              {selectableResources.map(
                (resource) => (
                  <option
                    key={resource.id}
                    value={resource.id}
                  >
                    {resource.name}
                    {" · "}
                    {resource.internalCode}
                    {" · Máx. "}
                    {resource.capacityMaximum}
                    {resource.status ===
                    "OUT_OF_SERVICE"
                      ? " · Fuera de servicio"
                      : ""}
                  </option>
                ),
              )}
            </select>

            <span className="create-booking-hint">
              Una reserva admite como máximo un
              alojamiento. Los recursos archivados
              no están disponibles.
            </span>
          </div>
        </section>

        <section className="create-booking-card">
          <div className="create-booking-card__header">
            <div
              className="create-booking-card__icon"
              aria-hidden="true"
            >
              <CalendarDays size={20} />
            </div>

            <div>
              <h2>Estadía</h2>
              <p>
                Fechas previstas para la reserva.
              </p>
            </div>
          </div>

          <div className="create-booking-two-columns">
            <div className="create-booking-field">
              <label htmlFor="booking-check-in">
                Entrada
              </label>

              <input
                id="booking-check-in"
                type="date"
                value={checkInDate}
                onChange={(event) => {
                  setCheckInDate(
                    event.target.value,
                  );
                  setValidationErrors(
                    (current) => ({
                      ...current,
                      dates: undefined,
                    }),
                  );
                }}
              />
            </div>

            <div className="create-booking-field">
              <label htmlFor="booking-check-out">
                Salida
              </label>

              <input
                id="booking-check-out"
                type="date"
                value={checkOutDate}
                onChange={(event) => {
                  setCheckOutDate(
                    event.target.value,
                  );
                  setValidationErrors(
                    (current) => ({
                      ...current,
                      dates: undefined,
                    }),
                  );
                }}
              />
            </div>
          </div>

          {validationErrors.dates && (
            <p
              className="create-booking-error"
              role="alert"
            >
              {validationErrors.dates}
            </p>
          )}
        </section>

        <section className="create-booking-card">
          <div className="create-booking-card__header">
            <div
              className="create-booking-card__icon"
              aria-hidden="true"
            >
              <Users size={20} />
            </div>

            <div>
              <h2>Huéspedes</h2>
              <p>
                Ocupación prevista.
              </p>
            </div>
          </div>

          <div className="create-booking-two-columns">
            <div className="create-booking-field">
              <label htmlFor="booking-adults">
                Adultos
              </label>

              <input
                id="booking-adults"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={adults}
                onChange={(event) => {
                  setAdults(
                    event.target.value,
                  );

                  setValidationErrors(
                    (current) => ({
                      ...current,
                      adults: undefined,
                      capacity: undefined,
                    }),
                  );
                }}
              />

              {validationErrors.adults && (
                <p
                  className="create-booking-error"
                  role="alert"
                >
                  {validationErrors.adults}
                </p>
              )}
            </div>

            <div className="create-booking-field">
              <label htmlFor="booking-children">
                Niños
              </label>

              <input
                id="booking-children"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={children}
                onChange={(event) => {
                  setChildren(
                    event.target.value,
                  );

                  setValidationErrors(
                    (current) => ({
                      ...current,
                      children: undefined,
                      childrenCapacity: undefined,
                      capacity: undefined,
                    }),
                  );
                }}
              />

              {validationErrors.children && (
                <p
                  className="create-booking-error"
                  role="alert"
                >
                  {validationErrors.children}
                </p>
              )}
            </div>
          </div>

          {validationErrors.childrenCapacity && (
            <p
              className="create-booking-error"
              role="alert"
            >
              {validationErrors.childrenCapacity}
            </p>
          )}

          {validationErrors.capacity && (
            <p
              className="create-booking-error"
              role="alert"
            >
              {validationErrors.capacity}
            </p>
          )}
        </section>

        <section className="create-booking-card">
          <div className="create-booking-card__header">
            <div
              className="create-booking-card__icon"
              aria-hidden="true"
            >
              <ClipboardList size={20} />
            </div>

            <div>
              <h2>Notas</h2>
              <p>
                Información adicional.
              </p>
            </div>
          </div>

          <div className="create-booking-field">
            <label htmlFor="booking-notes">
              Notas
            </label>

            <textarea
              id="booking-notes"
              rows={5}
              maxLength={1000}
              value={notes}
              onChange={(event) => {
                setNotes(
                  event.target.value,
                );

                setValidationErrors(
                  (current) => ({
                    ...current,
                    notes: undefined,
                  }),
                );
              }}
              placeholder="Observaciones de la reserva..."
            />

            <div className="create-booking-counter">
              <span>
                {validationErrors.notes ?? ""}
              </span>
              <span>
                {notes.length}/1000
              </span>
            </div>
          </div>
        </section>
      </div>

      <aside className="create-booking-sidebar">
        <section className="create-booking-summary">
          <h2>Resumen</h2>

          <dl>
            <div>
              <dt>Contacto</dt>
              <dd>
                {contactId
                  ? (contacts ?? []).find(
                      (contact) =>
                        contact.id ===
                        contactId,
                    )?.fullName ??
                    "Seleccionado"
                  : "Pendiente"}
              </dd>
            </div>

            <div>
              <dt>Alojamiento</dt>
              <dd>
                {selectedResource?.name ??
                  "Pendiente"}
              </dd>
            </div>

            <div>
              <dt>Entrada</dt>
              <dd>
                {checkInDate || "Pendiente"}
              </dd>
            </div>

            <div>
              <dt>Salida</dt>
              <dd>
                {checkOutDate || "Pendiente"}
              </dd>
            </div>
          </dl>

          <div className="create-booking-summary__notice">
            Mientras la reserva siga en borrador,
            estos datos pueden modificarse.
          </div>

          {errorMessage && (
            <div
              className="create-booking-submit-error"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div className="create-booking-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={onCancel}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={isPending}
            >
              {isPending
                ? pendingLabel
                : submitLabel}
            </Button>
          </div>
        </section>
      </aside>
    </form>
  );
}