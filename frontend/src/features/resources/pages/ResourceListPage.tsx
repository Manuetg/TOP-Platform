import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronRight,
  ImageIcon,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useResourceImageCovers } from "../queries/use-resource-image-covers";
import { useResources } from "../queries/use-resources";
import type {
  Resource,
  ResourceImageCover,
  ResourceStatus,
} from "../types/resource.types";
import "./ResourceListPage.css";

interface ResourceListPageProps {
  businessId?: string;
}


type ResourceStatusFilter = "ALL" | ResourceStatus;

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

interface ResourceCardProps {
  resource: Resource;
  cover?: ResourceImageCover;
}

function ResourceCard({
  resource,
  cover,
}: ResourceCardProps) {
  const navigate = useNavigate();

  const openResource = () =>
    navigate(`/app/resources/${resource.id}`);

  return (
    <article className="resource-list-card">
      <button
        type="button"
        className="resource-list-card__link"
        onClick={openResource}
        aria-label={`Ver ${resource.name}`}
      />

      <div className="resource-list-card__media">
        {cover ? (
          <img
            className="resource-list-card__media-image"
            src={cover.url}
            alt={`Portada de ${resource.name}`}
          />
        ) : (
          <div className="resource-list-card__media-placeholder">
            <div className="resource-list-card__illustration">
              <Building2
                size={34}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </div>

            <span>Imagen del recurso</span>
          </div>
        )}
      </div>

      <div className="resource-list-card__body">
        <div className="resource-list-card__identity">
          <h2>{resource.name}</h2>

          <p className="resource-list-card__meta">
            <span className="resource-list-card__code">
              {resource.internalCode}
              <span aria-hidden="true"> · </span>
            </span>

            <span>
              Hasta {resource.capacityMaximum}{" "}
              {resource.capacityMaximum === 1
                ? "huésped"
                : "huéspedes"}
            </span>
          </p>

          <div className="resource-list-card__amenities">
            {resource.amenities.length > 0 ? (
              <>
                {resource.amenities
                  .slice(0, 3)
                  .map((amenity) => (
                    <span
                      key={amenity.id}
                      className="resource-list-card__amenity"
                    >
                      {amenity.name}
                    </span>
                  ))}

                {resource.amenities.length > 3 && (
                  <span className="resource-list-card__amenity">
                    +{resource.amenities.length - 3}
                  </span>
                )}
              </>
            ) : (
              <span className="resource-list-card__amenities-empty">
                Sin amenities
              </span>
            )}
          </div>
        </div>

        <div className="resource-list-card__footer">
          <span
            className={`resource-list-card__status resource-list-card__status--${resource.status.toLowerCase()}`}
          >
            {getResourceStatusLabel(resource.status)}
          </span>

          <ChevronRight
            className="resource-list-card__chevron"
            size={20}
            aria-hidden="true"
          />
        </div>
      </div>
    </article>
  );
}

export function ResourceListPage({
  businessId: suppliedBusinessId,
}: ResourceListPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;

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

  const { data: imageCovers } =
    useResourceImageCovers({
      businessId,
      accessToken: session?.accessToken,
    });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ResourceStatusFilter>("ALL");

  const resourceDeckRef =
    useRef<HTMLDivElement | null>(null);

  const [activeResourceIndex, setActiveResourceIndex] =
    useState(0);

  const normalizedSearchTerm =
    searchTerm.trim().toLocaleLowerCase();

  const filteredResources = useMemo(() => {
    const currentResources = resources ?? [];

    return currentResources.filter((resource) => {
      const matchesSearch =
        normalizedSearchTerm.length === 0 ||
        resource.name
          .toLocaleLowerCase()
          .includes(normalizedSearchTerm) ||
        resource.internalCode
          .toLocaleLowerCase()
          .includes(normalizedSearchTerm);

      const matchesStatus =
        statusFilter === "ALL" ||
        resource.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    normalizedSearchTerm,
    resources,
    statusFilter,
  ]);

  const imageCoverByResourceId = useMemo(
    () =>
      new Map(
        (imageCovers ?? []).map((cover) => [
          cover.resourceId,
          cover,
        ]),
      ),
    [imageCovers],
  );

  const hasActiveFilters =
    normalizedSearchTerm.length > 0 ||
    statusFilter !== "ALL";

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
  }

  useEffect(() => {
    const deck = resourceDeckRef.current;

    if (!deck) {
      return;
    }

    const updateActiveCard = () => {
      if (window.innerWidth >= 768) {
        return;
      }

      const cards = Array.from(
        deck.querySelectorAll<HTMLElement>(
          ".resource-list-card",
        ),
      );

      if (cards.length === 0) {
        return;
      }

      const deckRect = deck.getBoundingClientRect();
      const deckCenter =
        deckRect.left + deckRect.width / 2;

      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter =
          cardRect.left + cardRect.width / 2;

        const distance = Math.abs(
          deckCenter - cardCenter,
        );

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveResourceIndex(closestIndex);
    };

    updateActiveCard();

    deck.addEventListener(
      "scroll",
      updateActiveCard,
      { passive: true },
    );

    window.addEventListener(
      "resize",
      updateActiveCard,
    );

    return () => {
      deck.removeEventListener(
        "scroll",
        updateActiveCard,
      );

      window.removeEventListener(
        "resize",
        updateActiveCard,
      );
    };
  }, [filteredResources.length]);

  if (!businessId) {
    return (
      <section
        className="resource-list-page"
        aria-labelledby="resources-title"
      >
        <h1 id="resources-title">Recursos</h1>

        <p>
          No hay un negocio activo para cargar los
          recursos durante el desarrollo.
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
          <h1 id="resources-title">Recursos</h1>

          <p>
            Gestioná las unidades, espacios y activos
            operativos del alojamiento.
          </p>
        </div>

        <Button
          type="button"
          className="resource-list-header__create"
          onClick={() =>
            navigate("/app/resources/new")
          }
        >
          <Plus size={18} aria-hidden="true" />
          Nuevo recurso
        </Button>
      </header>

      {resourceCount === 0 ? (
        <div className="resource-list-empty">
          <div className="resource-list-empty__visual">
            <ImageIcon size={32} aria-hidden="true" />
          </div>

          <div>
            <h2>Creá tu primer recurso</h2>

            <p>
              Los recursos representan las habitaciones,
              cabañas o unidades que pueden recibir
              reservas.
            </p>
          </div>

          <Button
            type="button"
            onClick={() =>
              navigate("/app/resources/new")
            }
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo recurso
          </Button>
        </div>
      ) : (
        <>
          <div
            className="resource-list-filters"
            aria-label="Filtros de recursos"
          >
            <div className="resource-list-filters__search">
              <label htmlFor="resource-search">
                Buscar
              </label>

              <div className="resource-list-filters__search-control">
                <Search
                  size={18}
                  aria-hidden="true"
                />

                <input
                  id="resource-search"
                  type="search"
                  aria-label="Buscar recurso"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Buscar por nombre o código..."
                />
              </div>
            </div>

            <div className="resource-list-filters__status">
              <label htmlFor="resource-status-filter">
                Estado
              </label>

              <select
                id="resource-status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target
                      .value as ResourceStatusFilter,
                  )
                }
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Activo</option>
                <option value="OUT_OF_SERVICE">
                  Fuera de servicio
                </option>
                <option value="ARCHIVED">
                  Archivado
                </option>
              </select>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                className="resource-list-filters__clear"
                onClick={clearFilters}
              >
                <X size={16} aria-hidden="true" />
                Limpiar
              </Button>
            )}
          </div>

          <div className="resource-list-summary">
            {filteredResources.length}{" "}
            {filteredResources.length === 1
              ? "recurso"
              : "recursos"}
          </div>

          {filteredResources.length === 0 ? (
            <div
              className="resource-list-no-results"
              role="status"
            >
              <Search size={28} aria-hidden="true" />

              <div>
                <h2>No encontramos recursos</h2>

                <p>
                  Probá con otro nombre, código interno o
                  estado.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <div
              ref={resourceDeckRef}
              className="resource-list-items"
              aria-label="Recursos"
            >
              {filteredResources.map(
                (resource, index) => (
                  <div
                    key={resource.id}
                    className={`resource-list-deck-item${
                      index === activeResourceIndex
                        ? " resource-list-deck-item--active"
                        : ""
                    }`}
                  >
                    <ResourceCard
                      resource={resource}
                      cover={imageCoverByResourceId.get(
                        resource.id,
                      )}
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
