import {
  ArrowLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useContact } from "../queries/use-contact";
import type { ContactStatus } from "../types/contact.types";
import "./ContactDetailPage.css";


function getStatusLabel(status: ContactStatus) {
  switch (status) {
    case "ACTIVE":
      return "Activo";
    case "INACTIVE":
      return "Inactivo";
    case "ARCHIVED":
      return "Archivado";
  }
}

function getInitials(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="contact-detail-item">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

export function ContactDetailPage() {
  const navigate = useNavigate();
  const { contactId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();

  const {
    data: contact,
    isLoading,
    isError,
    error,
    refetch,
  } = useContact({
    businessId: activeBusinessId,
    contactId,
    accessToken: session?.accessToken,
  });

  if (isLoading) {
    return (
      <section
        className="contact-detail-page"
        aria-busy="true"
      >
        <div className="contact-detail-state">
          <div
            className="contact-detail-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>Cargando contacto</h1>
          <p>
            Estamos preparando la información del contacto.
          </p>
        </div>
      </section>
    );
  }

  if (isError || !contact) {
    return (
      <section className="contact-detail-page">
        <button
          type="button"
          className="contact-detail-back"
          onClick={() => navigate("/app/contacts")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Contactos
        </button>

        <div
          className="contact-detail-state"
          role="alert"
        >
          <div
            className="contact-detail-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>No pudimos cargar el contacto</h1>

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

  const phone =
    contact.phone ?? contact.whatsapp;

  const location = [
    contact.city,
    contact.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      className="contact-detail-page"
      aria-labelledby="contact-detail-title"
    >
      <button
        type="button"
        className="contact-detail-back"
        onClick={() => navigate("/app/contacts")}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Contactos
      </button>

      <header className="contact-detail-header">
        <div className="contact-detail-header__identity">
          <div
            className="contact-detail-avatar"
            aria-hidden="true"
          >
            {getInitials(contact.fullName)}
          </div>

          <div>
            <div className="contact-detail-header__title">
              <h1 id="contact-detail-title">
                {contact.fullName}
              </h1>

              <span
                className={`contact-detail-status contact-detail-status--${contact.status.toLowerCase()}`}
              >
                {getStatusLabel(contact.status)}
              </span>
            </div>

            {location && (
              <p>
                <MapPin
                  size={15}
                  aria-hidden="true"
                />
                {location}
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            navigate(`/app/contacts/${contact.id}/edit`)
          }
        >
          <Pencil size={18} aria-hidden="true" />
          Editar
        </Button>
      </header>

      <div className="contact-detail-grid">
        <section className="contact-detail-card">
          <div className="contact-detail-card__header">
            <h2>Información personal</h2>
          </div>

          <div className="contact-detail-items">
            <DetailItem
              label="Nombre"
              value={contact.name}
            />

            <DetailItem
              label="Apellido"
              value={contact.lastName}
            />

            <DetailItem
              label="Tipo de documento"
              value={contact.documentType}
            />

            <DetailItem
              label="Número de documento"
              value={contact.documentNumber}
            />
          </div>
        </section>

        <section className="contact-detail-card">
          <div className="contact-detail-card__header">
            <h2>Contacto</h2>
          </div>

          <div className="contact-detail-contact">
            <div className="contact-detail-contact__row">
              <Phone
                size={18}
                aria-hidden="true"
              />

              <div>
                <span>Teléfono / WhatsApp</span>
                <strong>{phone || "—"}</strong>
              </div>
            </div>

            <div className="contact-detail-contact__row">
              <Mail
                size={18}
                aria-hidden="true"
              />

              <div>
                <span>Email</span>
                <strong>{contact.email || "—"}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="contact-detail-card">
          <div className="contact-detail-card__header">
            <h2>Ubicación</h2>
          </div>

          <div className="contact-detail-items">
            <DetailItem
              label="País"
              value={contact.country}
            />

            <DetailItem
              label="Ciudad"
              value={contact.city}
            />
          </div>
        </section>
      </div>
    </section>
  );
}
