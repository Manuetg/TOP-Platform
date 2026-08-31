import {
  ArrowLeft,
  BedDouble,
  Building2,
  Pencil,
  Users,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResource } from "../queries/use-resource";
import type { ResourceStatus } from "../types/resource.types";
import "./ResourceDetailPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function getResourceStatusLabel(status: ResourceStatus) {
  switch (status) {
    case "ACTIVE":
      return "Activo";
    case "OUT_OF_SERVICE":
      return "Fuera de servicio";
    case "ARCHIVED":
      return "Archivado";
  }
}

export function ResourceDetailPage() {
  const navigate = useNavigate();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();

  const {
    data: resource,
    isLoading,
    isError,
    error,
    refetch,
  } = useResource({
    businessId: TEMP_BUSINESS_ID,
    resourceId,
    accessToken: session?.accessToken,
  });

  if (!TEMP_BUSINESS_ID || !resourceId) {
    return (
      <section className="resource-detail-page">
        <h1>Recurso</h1>
        <p>No se pudo determinar el recurso solicitado.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="resource-detail-page">
        <div className="resource-detail-loading" role="status">
          Cargando recurso…
        </div>
      </section>
    );
  }

  if (isError || !resource) {
    const message =
      error instanceof Error
        ? error.message
        : "No pudimos cargar el recurso.";

    return (
      <section className="resource-detail-page">
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate("/app/resources")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver a Recursos
        </Button>

        <div className="resource-detail-error" role="alert">
          <p>{message}</p>

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
    <section
      className="resource-detail-page"
      aria-labelledby="resource-detail-title"
    >
      <button
        type="button"
        className="resource-detail-back"
        onClick={() => navigate("/app/resources")}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a Recursos
      </button>

      <header className="resource-detail-header">
        <div>
          <span className="resource-detail-eyebrow">
            Recurso
          </span>

          <div className="resource-detail-title-row">
            <h1 id="resource-detail-title">
              {resource.name}
            </h1>

            <span
              className={`resource-detail-status resource-detail-status--${resource.status.toLowerCase()}`}
            >
              <span
                className="resource-detail-status__dot"
                aria-hidden="true"
              />
              {getResourceStatusLabel(resource.status)}
            </span>
          </div>

          <p className="resource-detail-code">
            {resource.internalCode}
          </p>
        </div>

        <Button type="button" variant="secondary">
          <Pencil size={16} aria-hidden="true" />
          Editar recurso
        </Button>
      </header>

      <div
        className="resource-detail-media"
        role="img"
        aria-label={`Imagen de ${resource.name} no configurada`}
      >
        <div className="resource-detail-media__placeholder">
          <Building2 size={36} aria-hidden="true" />

          <div>
            <strong>{resource.name}</strong>
            <span>Imagen del recurso no configurada</span>
          </div>
        </div>
      </div>

      <div className="resource-detail-grid">
        <article className="resource-detail-card resource-detail-card--main">
          <div className="resource-detail-card__heading">
            <Building2 size={20} aria-hidden="true" />
            <h2>Información general</h2>
          </div>

          <div className="resource-detail-description">
            <span>Descripción</span>
            <p>
              {resource.description?.trim()
                ? resource.description
                : "Sin descripción configurada."}
            </p>
          </div>
        </article>

        <article className="resource-detail-card">
          <div className="resource-detail-card__heading">
            <Users size={20} aria-hidden="true" />
            <h2>Capacidad</h2>
          </div>

          <dl className="resource-detail-stats">
            <div>
              <dt>Huéspedes</dt>
              <dd>
                {resource.capacityMinimum}–
                {resource.capacityMaximum}
              </dd>
            </div>

            <div>
              <dt>Niños</dt>
              <dd>
                Hasta {resource.capacityMaximumChildren}
              </dd>
            </div>
          </dl>
        </article>

        <article className="resource-detail-card">
          <div className="resource-detail-card__heading">
            <BedDouble size={20} aria-hidden="true" />
            <h2>Amenities</h2>
          </div>

          {resource.amenities.length > 0 ? (
            <div className="resource-detail-amenities">
              {resource.amenities.map((amenity) => (
                <span
                  key={amenity.id}
                  className="resource-detail-amenity"
                >
                  {amenity.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="resource-detail-empty-copy">
              Sin amenities configurados.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
