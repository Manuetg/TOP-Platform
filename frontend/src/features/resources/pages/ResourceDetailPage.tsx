import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { deleteResourceImage } from "../api/delete-resource-image";
import { disableResource } from "../api/disable-resource";
import { reactivateResource } from "../api/reactivate-resource";
import { uploadResourceImage } from "../api/upload-resource-image";
import { ResourceAmenitiesEditor } from "../components/ResourceAmenitiesEditor";
import { useResourceImages } from "../queries/use-resource-images";
import { useResource } from "../queries/use-resource";
import type { ResourceStatus } from "../types/resource.types";
import "./ResourceDetailPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

const MAX_RESOURCE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_RESOURCE_IMAGES = 10;

const ALLOWED_RESOURCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
  const queryClient = useQueryClient();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(
    null,
  );

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageActionError, setImageActionError] = useState<string | null>(
    null,
  );
  const [currentImageId, setCurrentImageId] = useState<string | null>(
    null,
  );
  const [isManagingImage, setIsManagingImage] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const {
    data: resourceImages = [],
    isLoading: areImagesLoading,
  } = useResourceImages({
    businessId: TEMP_BUSINESS_ID,
    resourceId,
    accessToken: session?.accessToken,
  });

  const selectedImageIndex = currentImageId
    ? resourceImages.findIndex((image) => image.id === currentImageId)
    : -1;

  const displayedImageIndex =
    selectedImageIndex >= 0 ? selectedImageIndex : 0;

  const currentImage = resourceImages[displayedImageIndex];
  const currentImageFailed = currentImage
    ? failedImageIds.has(currentImage.id)
    : false;

  function showPreviousImage() {
    if (resourceImages.length <= 1) {
      return;
    }

    const previousIndex =
      displayedImageIndex === 0
        ? resourceImages.length - 1
        : displayedImageIndex - 1;

    setCurrentImageId(resourceImages[previousIndex].id);
  }

  function showNextImage() {
    if (resourceImages.length <= 1) {
      return;
    }

    const nextIndex =
      displayedImageIndex >= resourceImages.length - 1
        ? 0
        : displayedImageIndex + 1;

    setCurrentImageId(resourceImages[nextIndex].id);
  }

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file || !resource) {
      return;
    }

    setImageActionError(null);

    if (!ALLOWED_RESOURCE_IMAGE_TYPES.has(file.type)) {
      setImageActionError("La imagen debe ser JPEG, PNG o WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_RESOURCE_IMAGE_SIZE_BYTES) {
      setImageActionError("La imagen no puede superar 5 MB.");
      event.target.value = "";
      return;
    }

    if (resourceImages.length >= MAX_RESOURCE_IMAGES) {
      setImageActionError(
        "Este recurso ya alcanzó el máximo de 10 imágenes.",
      );
      event.target.value = "";
      return;
    }

    setIsUploadingImage(true);

    try {
      const uploadedImage = await uploadResourceImage({
        businessId: TEMP_BUSINESS_ID,
        resourceId: resource.id,
        file,
        accessToken: session?.accessToken,
      });

      const imageQueryKey = [
        "resources",
        TEMP_BUSINESS_ID,
        resource.id,
        "images",
      ];

      queryClient.setQueryData(
        imageQueryKey,
        [...resourceImages, uploadedImage].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.id.localeCompare(right.id),
        ),
      );

      setCurrentImageId(uploadedImage.id);

      await queryClient.invalidateQueries({
        queryKey: imageQueryKey,
        exact: true,
      });
    } catch (uploadError) {
      setImageActionError(
        uploadError instanceof Error
          ? uploadError.message
          : "No pudimos subir la imagen.",
      );
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleDeleteCurrentImage() {
    if (
      !resource ||
      !currentImage ||
      isManagingImage ||
      resource.status === "ARCHIVED"
    ) {
      return;
    }

    const confirmed = window.confirm(
      "¿Querés eliminar esta imagen del recurso?",
    );

    if (!confirmed) {
      return;
    }

    const imageQueryKey = [
      "resources",
      TEMP_BUSINESS_ID,
      resource.id,
      "images",
    ];

    setImageActionError(null);
    setIsManagingImage(true);

    try {
      await deleteResourceImage({
        businessId: TEMP_BUSINESS_ID,
        resourceId: resource.id,
        imageId: currentImage.id,
        accessToken: session?.accessToken,
      });

      const remainingImages = resourceImages
        .filter((image) => image.id !== currentImage.id)
        .map((image, sortOrder) => ({
          ...image,
          sortOrder,
        }));

      queryClient.setQueryData(imageQueryKey, remainingImages);

      const nextSelectedImage =
        remainingImages[
          Math.min(
            displayedImageIndex,
            remainingImages.length - 1,
          )
        ];

      setCurrentImageId(nextSelectedImage?.id ?? null);

      await queryClient.invalidateQueries({
        queryKey: imageQueryKey,
        exact: true,
      });
    } catch (deleteError) {
      setImageActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "No pudimos eliminar la imagen.",
      );
    } finally {
      setIsManagingImage(false);
    }
  }

  async function handleDisableResource() {
    if (!resource || resource.status !== "ACTIVE") {
      return;
    }

    setStatusActionError(null);
    setIsUpdatingStatus(true);

    try {
      const updatedResource = await disableResource({
        businessId: TEMP_BUSINESS_ID,
        resourceId: resource.id,
        accessToken: session?.accessToken,
      });

      queryClient.setQueryData(
        ["resources", TEMP_BUSINESS_ID, resource.id],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", TEMP_BUSINESS_ID],
        exact: true,
      });
    } catch (disableResourceError) {
      setStatusActionError(
        disableResourceError instanceof Error
          ? disableResourceError.message
          : "No pudimos poner el recurso fuera de servicio.",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleReactivateResource() {
    if (!resource || resource.status !== "OUT_OF_SERVICE") {
      return;
    }

    setStatusActionError(null);
    setIsUpdatingStatus(true);

    try {
      const updatedResource = await reactivateResource({
        businessId: TEMP_BUSINESS_ID,
        resourceId: resource.id,
        accessToken: session?.accessToken,
      });

      queryClient.setQueryData(
        ["resources", TEMP_BUSINESS_ID, resource.id],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", TEMP_BUSINESS_ID],
        exact: true,
      });
    } catch (reactivateResourceError) {
      setStatusActionError(
        reactivateResourceError instanceof Error
          ? reactivateResourceError.message
          : "No pudimos reactivar el recurso.",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

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
        <button
          type="button"
          className="resource-detail-back"
          onClick={() => navigate("/app/resources")}
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Recursos
        </button>

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

  const canManageImages = resource.status !== "ARCHIVED";

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
        <ArrowLeft size={20} aria-hidden="true" />
        Recursos
      </button>

      <header className="resource-detail-header">
        <div className="resource-detail-title-group">
          <h1 id="resource-detail-title">{resource.name}</h1>

          <button
            type="button"
            role="switch"
            aria-checked={resource.status === "ACTIVE"}
            aria-label={
              resource.status === "ACTIVE"
                ? "Poner fuera de servicio"
                : resource.status === "OUT_OF_SERVICE"
                  ? "Reactivar recurso"
                  : "Recurso archivado"
            }
            className={`resource-detail-status-switch resource-detail-status-switch--${resource.status.toLowerCase()}`}
            disabled={
              isUpdatingStatus || resource.status === "ARCHIVED"
            }
            onClick={() => {
              if (resource.status === "ACTIVE") {
                void handleDisableResource();
              } else if (resource.status === "OUT_OF_SERVICE") {
                void handleReactivateResource();
              }
            }}
          >
            <span aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="resource-detail-edit-button"
          aria-label="Editar recurso"
          onClick={() =>
            navigate(`/app/resources/${resource.id}/edit`)
          }
        >
          <Pencil size={20} aria-hidden="true" />
          <span>Editar recurso</span>
        </button>
      </header>

      {statusActionError ? (
        <div className="resource-detail-action-error" role="alert">
          {statusActionError}
        </div>
      ) : null}

      <div className="resource-detail-layout">
        <article className="resource-detail-card resource-detail-media-card">
          <div className="resource-detail-media">
            {areImagesLoading ? (
              <div
                className="resource-detail-media__placeholder"
                role="status"
              >
                <Building2 size={32} aria-hidden="true" />
                <span>Cargando imagen…</span>
              </div>
            ) : currentImage && !currentImageFailed ? (
              <>
                <img
                  className="resource-detail-media__image"
                  src={currentImage.url}
                  alt={resource.name}
                  onError={() => {
                    setFailedImageIds((current) => {
                      const next = new Set(current);
                      next.add(currentImage.id);
                      return next;
                    });
                  }}
                />

                <button
                  type="button"
                  className="resource-detail-icon-button resource-detail-icon-button--overlay resource-detail-icon-button--danger"
                  aria-label="Eliminar imagen"
                  disabled={!canManageImages || isManagingImage}
                  onClick={() => void handleDeleteCurrentImage()}
                >
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              </>
            ) : (
              <div
                className="resource-detail-media__placeholder"
                role="img"
                aria-label={`Imagen de ${resource.name} no configurada`}
              >
                <Building2 size={36} aria-hidden="true" />
                <div>
                  <strong>{resource.name}</strong>
                  <span>Imagen del recurso no configurada</span>
                </div>
              </div>
            )}
          </div>

          <footer className="resource-detail-media-toolbar">
            <span
              className="resource-detail-media-count"
              aria-live="polite"
            >
              {resourceImages.length > 0
                ? `${displayedImageIndex + 1} / ${resourceImages.length}`
                : `0 / ${MAX_RESOURCE_IMAGES}`}
            </span>

            <div
              className="resource-detail-media-navigation"
              aria-label="Navegación de imágenes"
            >
              {resourceImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="resource-detail-carousel-button"
                    aria-label="Imagen anterior"
                    onClick={showPreviousImage}
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>

                  <div className="resource-detail-media-dots">
                    {resourceImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        className={
                          index === displayedImageIndex
                            ? "resource-detail-media-dot resource-detail-media-dot--active"
                            : "resource-detail-media-dot"
                        }
                        aria-label={`Ver imagen ${index + 1} de ${resourceImages.length}`}
                        aria-current={
                          index === displayedImageIndex
                            ? "true"
                            : undefined
                        }
                        onClick={() => setCurrentImageId(image.id)}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="resource-detail-carousel-button"
                    aria-label="Imagen siguiente"
                    onClick={showNextImage}
                  >
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>

            <div className="resource-detail-media-actions">
              <input
                ref={imageInputRef}
                className="resource-detail-image-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  isUploadingImage ||
                  isManagingImage ||
                  !canManageImages ||
                  resourceImages.length >= MAX_RESOURCE_IMAGES
                }
                onChange={(event) => void handleImageChange(event)}
              />

              <button
                type="button"
                className="resource-detail-icon-button"
                aria-label={
                  isUploadingImage
                    ? "Subiendo imagen"
                    : "Agregar imagen"
                }
                disabled={
                  isUploadingImage ||
                  isManagingImage ||
                  !canManageImages ||
                  resourceImages.length >= MAX_RESOURCE_IMAGES
                }
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={20} aria-hidden="true" />
              </button>
            </div>
          </footer>

          {imageActionError ? (
            <div
              className="resource-detail-inline-error"
              role="alert"
            >
              {imageActionError}
            </div>
          ) : null}
        </article>

        <article className="resource-detail-card resource-detail-info-card">
          <h2>Información</h2>

          <dl className="resource-detail-info-list">
            <div>
              <dt>Código</dt>
              <dd>{resource.internalCode}</dd>
            </div>

            <div>
              <dt>Capacidad</dt>
              <dd>
                {resource.capacityMinimum}–{resource.capacityMaximum} huéspedes
                {" · "}
                {resource.capacityMaximumChildren} niños
              </dd>
            </div>

            <div>
              <dt>Descripción</dt>
              <dd>
                {resource.description?.trim()
                  ? resource.description
                  : "Sin descripción configurada."}
              </dd>
            </div>

            <div>
              <dt>Estado operativo</dt>
              <dd>
                <span
                  className={`resource-detail-status-badge resource-detail-status-badge--${resource.status.toLowerCase()}`}
                >
                  {getResourceStatusLabel(resource.status)}
                </span>
              </dd>
            </div>
          </dl>
        </article>

        <article className="resource-detail-card resource-detail-amenities-card">
          <h2>Amenities</h2>

          <ResourceAmenitiesEditor
            businessId={TEMP_BUSINESS_ID}
            resource={resource}
            accessToken={session?.accessToken}
          />
        </article>

        <article
          className="resource-detail-card resource-detail-actions-card"
          aria-label="Acciones"
        >
          <h2>Acciones</h2>
          <span className="resource-detail-visually-hidden">
            No hay acciones adicionales disponibles.
          </span>
        </article>
      </div>
    </section>
  );
}
