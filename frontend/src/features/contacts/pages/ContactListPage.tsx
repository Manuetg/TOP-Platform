import {
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useContacts } from "../queries/use-contacts";
import type {
  Contact,
  ContactStatus,
} from "../types/contact.types";
import "./ContactListPage.css";

interface ContactListPageProps {
  businessId?: string;
}


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

function getContactInitials(contact: Contact) {
  const parts = contact.fullName
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

function getLocation(contact: Contact) {
  return [contact.city, contact.country]
    .filter(Boolean)
    .join(", ");
}

function ContactRow({
  contact,
}: {
  contact: Contact;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="contact-list-row"
      onClick={() =>
        navigate(`/app/contacts/${contact.id}`)
      }
      aria-label={`Ver ${contact.fullName}`}
    >
      <span className="contact-list-row__contact">
        <span
          className="contact-list-avatar"
          aria-hidden="true"
        >
          {getContactInitials(contact)}
        </span>

        <span className="contact-list-row__identity">
          <strong>{contact.fullName}</strong>

          {getLocation(contact) && (
            <span>{getLocation(contact)}</span>
          )}
        </span>
      </span>

      <span className="contact-list-row__email">
        {contact.email ?? "—"}
      </span>

      <span className="contact-list-row__phone">
        {contact.phone ??
          contact.whatsapp ??
          "—"}
      </span>

      <span className="contact-list-row__document">
        {contact.documentNumber ?? "—"}
      </span>

      <span
        className={`contact-list-status contact-list-status--${contact.status.toLowerCase()}`}
      >
        {getStatusLabel(contact.status)}
      </span>
    </button>
  );
}

function ContactCard({
  contact,
}: {
  contact: Contact;
}) {
  const navigate = useNavigate();

  const contactNumber =
    contact.phone ?? contact.whatsapp;

  return (
    <article className="contact-list-card">
      <button
        type="button"
        className="contact-list-card__link"
        onClick={() =>
          navigate(`/app/contacts/${contact.id}`)
        }
        aria-label={`Ver ${contact.fullName}`}
      />

      <div className="contact-list-card__header">
        <span
          className="contact-list-avatar"
          aria-hidden="true"
        >
          {getContactInitials(contact)}
        </span>

        <div className="contact-list-card__identity">
          <h2>{contact.fullName}</h2>

          {getLocation(contact) && (
            <p>{getLocation(contact)}</p>
          )}
        </div>

        <span
          className={`contact-list-status contact-list-status--${contact.status.toLowerCase()}`}
        >
          {getStatusLabel(contact.status)}
        </span>
      </div>

      <div className="contact-list-card__details">
        {contactNumber && (
          <span>
            <Phone size={16} aria-hidden="true" />
            {contactNumber}
          </span>
        )}

        {contact.email && (
          <span>
            <Mail size={16} aria-hidden="true" />
            {contact.email}
          </span>
        )}
      </div>
    </article>
  );
}

export function ContactListPage({
  businessId: suppliedBusinessId,
}: ContactListPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;

  const [searchTerm, setSearchTerm] =
    useState("");
  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  const {
    data: contacts,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useContacts({
    businessId,
    query: debouncedSearch,
    accessToken: session?.accessToken,
  });

  const hasSearch =
    debouncedSearch.length > 0;

  if (isLoading) {
    return (
      <section
        className="contact-list-page"
        aria-busy="true"
      >
        <div className="contact-list-state">
          <div
            className="contact-list-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>Cargando contactos</h1>
          <p>
            Estamos preparando la información
            del Business.
          </p>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="contact-list-page">
        <div
          className="contact-list-state"
          role="alert"
        >
          <div
            className="contact-list-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>No pudimos cargar los contactos</h1>
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

  const currentContacts = contacts ?? [];

  return (
    <section className="contact-list-page">
      <header className="contact-list-header">
        <div>
          <h1>Contactos</h1>
          <p>
            Gestioná huéspedes y contactos del
            alojamiento.
          </p>
        </div>

        <Button
          type="button"
          className="contact-list-header__create"
          onClick={() => navigate("/app/contacts/new")}
        >
          <Plus size={18} aria-hidden="true" />
          Nuevo contacto
        </Button>
      </header>

      <div
        className="contact-list-search"
        aria-label="Búsqueda de contactos"
      >
        <label htmlFor="contact-search">
          Buscar
        </label>

        <div className="contact-list-search__control">
          <Search
            size={18}
            aria-hidden="true"
          />

          <input
            id="contact-search"
            type="search"
            aria-label="Buscar contacto"
            value={searchTerm}
            maxLength={120}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="Nombre, teléfono, email o documento..."
          />

          {searchTerm.length > 0 && (
            <button
              type="button"
              className="contact-list-search__clear"
              onClick={() => setSearchTerm("")}
              aria-label="Limpiar búsqueda"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="contact-list-summary">
        <span>
          {currentContacts.length}{" "}
          {currentContacts.length === 1
            ? "contacto"
            : "contactos"}
        </span>

        {isFetching && !isLoading && (
          <span
            className="contact-list-summary__loading"
            role="status"
          >
            Actualizando…
          </span>
        )}
      </div>

      {currentContacts.length === 0 ? (
        <div
          className="contact-list-state contact-list-state--compact"
          role="status"
        >
          <div
            className="contact-list-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h2>
            {hasSearch
              ? "No encontramos contactos"
              : "Todavía no hay contactos"}
          </h2>

          <p>
            {hasSearch
              ? "Probá con otro nombre, teléfono, email o documento."
              : "Los contactos que agregues al Business aparecerán acá."}
          </p>

          {hasSearch && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSearchTerm("")}
            >
              Limpiar búsqueda
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="contact-list-table">
            <div
              className="contact-list-table__header"
              aria-hidden="true"
            >
              <span>Contacto</span>
              <span>Email</span>
              <span>Teléfono</span>
              <span>Documento</span>
              <span>Estado</span>
            </div>

            <div className="contact-list-table__body">
              {currentContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                />
              ))}
            </div>
          </div>

          <div className="contact-list-cards">
            {currentContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
