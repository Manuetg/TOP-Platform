import {
  BedDouble,
  Building2,
  ImageIcon,

  ArrowRight,
  Plus,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useResources } from "../queries/use-resources";
import type {
  Resource,
  ResourceStatus,
} from "../types/resource.types";
import "./ResourceListPage.css";

interface ResourceListPageProps {
  businessId?: string;
}

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

function ResourceCard({ resource }: { resource: Resource }) {
  const navigate = useNavigate();
  const visibleAmenities = resource.amenities.slice(0, 4);
  const remainingAmenities =
    resource.amenities.length - visibleAmenities.length;

  return (
    <article className="resource-list-card">
      <div className="resource-list-card__media">
        <div className="resource-list-card__media-placeholder">
          <div className="resource-list-card__illustration">
            <Building2 size={42} aria-hidden="true" />
          </div>

          <span>Imagen del recurso</span>
        </div>
      </div>

      <div className="resource-list-card__body">
        <div className="resource-list-card__heading">
          <div className="resource-list-card__identity">
            <div className="resource-list-card__title-row">
              <h2>{resource.name}</h2>

              <span
                className={`resource-list-card__status resource-list-card__status--${resource.status.toLowerCase()}`}
              >
                <span
                  className="resource-list-card__status-dot"
                  aria-hidden="true"
                />

                {getResourceStatusLabel(resource.status)}
              </span>
            </div>

            <p className="resource-list-card__code">
              {resource.internalCode}
            </p>
          </div>


        </div>

        <div className="resource-list-card__metadata">
          <div className="resource-list-card__metadata-item">
            <div className="resource-list-card__metadata-icon">
              <Users size={18} aria-hidden="true" />
            </div>

            <div>
              <span>Capacidad</span>
              <strong>
                {resource.capacityMinimum}–{resource.capacityMaximum} huéspedes
              </strong>
            </div>
          </div>

          <div className="resource-list-card__metadata-item">
            <div className="resource-list-card__metadata-icon">
              <BedDouble size={18} aria-hidden="true" />
            </div>

            <div>
              <span>Niños</span>
              <strong>
                Hasta {resource.capacityMaximumChildren}
              </strong>
            </div>
          </div>
        </div>

        <div className="resource-list-card__amenities">
          {visibleAmenities.length > 0 ? (
            <>
              {visibleAmenities.map((amenity) => (
                <span
                  key={amenity.id}
                  className="resource-list-card__amenity"
                >
                  {amenity.name}
                </span>
              ))}

              {remainingAmenities > 0 && (
                <span className="resource-list-card__amenity">
                  +{remainingAmenities}
                </span>
              )}
            </>
          ) : (
            <span className="resource-list-card__amenities-empty">
              Sin amenities configurados
            </span>
          )}
        </div>

        <div className="resource-list-card__footer">
          <Button
            type="button"
            variant="secondary"
            className="resource-list-card__edit"
            onClick={() =>
              navigate(`/app/resources/${resource.id}`)
            }
          >
            <span className="resource-list-card__edit-mobile">
              Ver
            </span>

            <span className="resource-list-card__edit-desktop">
              Ver detalle
            </span>

            <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ResourceListPage({
  businessId = TEMP_BUSINESS_ID,
}: ResourceListPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const {
    data: resources,
    isLoading,
    isError,
    error,
    refetch,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  if (!businessId) {
    return (
      <section
        className="resource-list-page"
        aria-labelledby="resources-title"
      >
        <h1 id="resources-title">Recursos</h1>

        <p>
          Configurá VITE_DEV_BUSINESS_ID para cargar los recursos durante el desarrollo.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className="resource-list-page"
        aria-labelledby="resources-title"
      >
        <h1 id="resources-title">Recursos</h1>

        <div
          className="resource-list-loading"
          role="status"
        >
          Cargando recursos…
        </div>
      </section>
    );
  }

  if (isError) {
    const message =
      error instanceof Error
        ? error.message
        : "No pudimos cargar los recursos.";

    return (
      <section
        className="resource-list-page"
        aria-labelledby="resources-title"
      >
        <h1 id="resources-title">Recursos</h1>

        <div
          className="resource-list-error"
          role="alert"
        >
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

  const resourceCount = resources?.length ?? 0;

  return (
    <section
      className="resource-list-page"
      aria-labelledby="resources-title"
    >
      <header className="resource-list-header">
        <div className="resource-list-header__copy">
          <span className="resource-list-header__eyebrow">
            Gestión de unidades
          </span>

          <h1 id="resources-title">Recursos</h1>

          <p>
            Administrá las habitaciones, cabañas o unidades disponibles para reservas.
          </p>
        </div>

        <Button
  type="button"
  className="resource-list-header__create"
          onClick={() => navigate("/app/resources/new")}
>
  <Plus size={16} aria-hidden="true" />
  <span className="resource-list-header__create-mobile">
    Nuevo
  </span>
  <span className="resource-list-header__create-desktop">
    Nuevo recurso
  </span>
</Button>
      </header>

      <div className="resource-list-usage">
        <div className="resource-list-usage__icon">
          <BedDouble size={20} aria-hidden="true" />
        </div>

        <div className="resource-list-usage__content">
          <span>Recursos configurados</span>

          <strong>
            {resourceCount} {resourceCount === 1 ? "recurso" : "recursos"}
          </strong>
        </div>
      </div>

      {resourceCount === 0 ? (
        <div className="resource-list-empty">
          <div className="resource-list-empty__visual">
            <ImageIcon size={32} aria-hidden="true" />
          </div>

          <div>
            <h2>Creá tu primer recurso</h2>

            <p>
              Los recursos representan las habitaciones, cabañas o unidades que pueden recibir reservas.
            </p>
          </div>

          <Button type="button">
            <Plus size={18} aria-hidden="true" />
            Nuevo recurso
          </Button>
        </div>
      ) : (
        <div className="resource-list-content">
          <div className="resource-list-content__heading">
            <div>
              <h2>Tus recursos</h2>

              <p>
                Información principal de las unidades configuradas en este negocio.
              </p>
            </div>

            <span className="resource-list-content__count">
              {resourceCount}
            </span>
          </div>

          <div className="resource-list-items">
            {resources?.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
