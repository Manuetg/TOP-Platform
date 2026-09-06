import {
  ArrowLeft,
  BedDouble,
  Building2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MoveLeft,
  MoveRight,
  Pencil,
  Trash2,
  Users,
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
import { reorderResourceImages } from "../api/reorder-resource-images";
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
    ? resourceImages.findIndex(
        (image) => image.id === currentImageId,
      )
    : -1;

  const displayedImageIndex =
    selectedImageIndex >= 0 ? selectedImageIndex : 0;

  const currentImage = resourceImages[displayedImageIndex];

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

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file || !resource) {
      return;
    }

    setImageActionError(null);

    if (!ALLOWED_RESOURCE_IMAGE_TYPES.has(file.type)) {
      setImageActionError(
        "La imagen debe ser JPEG, PNG o WEBP.",
      );
      event.target.value = "";
      return;
    }

    if (file.size > MAX_RESOURCE_IMAGE_SIZE_BYTES) {
      setImageActionError(
        "La imagen no puede superar 5 MB.",
      );
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
  async function handleMoveCurrentImage(
    direction: "previous" | "next",
  ) {
    if (
      !resource ||
      !currentImage ||
      isManagingImage ||
      resource.status === "ARCHIVED"
    ) {
      return;
    }

    const targetIndex =
      direction === "previous"
        ? displayedImageIndex - 1
        : displayedImageIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= resourceImages.length
    ) {
      return;
    }

    const reorderedImages = [...resourceImages];
    const [movedImage] = reorderedImages.splice(
      displayedImageIndex,
      1,
    );

    reorderedImages.splice(targetIndex, 0, movedImage);

    const normalizedImages = reorderedImages.map(
      (image, sortOrder) => ({
        ...image,
        sortOrder,
      }),
    );

    const imageQueryKey = [
      "resources",
      TEMP_BUSINESS_ID,
      resource.id,
      "images",
    ];

    setImageActionError(null);
    setIsManagingImage(true);

    try {
      await reorderResourceImages({
        businessId: TEMP_BUSINESS_ID,
        resourceId: resource.id,
        imageIds: normalizedImages.map((image) => image.id),
        accessToken: session?.accessToken,
      });

      queryClient.setQueryData(
        imageQueryKey,
        normalizedImages,
      );

      setCurrentImageId(currentImage.id);

      await queryClient.invalidateQueries({
        queryKey: imageQueryKey,
        exact: true,
      });
    } catch (reorderError) {
      setImageActionError(
        reorderError instanceof Error
          ? reorderError.message
          : "No pudimos cambiar el orden de las imágenes.",
      );
    } finally {
      setIsManagingImage(false);
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

      queryClient.setQueryData(
        imageQueryKey,
        remainingImages,
      );

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

    const confirmed = window.confirm(
      `¿Querés poner "${resource.name}" fuera de servicio?`,
    );

    if (!confirmed) {
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

    const confirmed = window.confirm(
      `¿Querés reactivar "${resource.name}"?`,
    );

    if (!confirmed) {
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

        <div className="resource-detail-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate(`/app/resources/${resource.id}/edit`)
            }
          >
            <Pencil size={16} aria-hidden="true" />
            Editar recurso
          </Button>

          {resource.status === "ACTIVE" ? (
            <Button
              type="button"
              variant="danger"
              disabled={isUpdatingStatus}
              onClick={() => void handleDisableResource()}
            >
              {isUpdatingStatus
                ? "Procesando…"
                : "Poner fuera de servicio"}
            </Button>
          ) : null}
          {resource.status === "OUT_OF_SERVICE" ? (
            <Button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => void handleReactivateResource()}
            >
              {isUpdatingStatus
                ? "Procesando…"
                : "Reactivar recurso"}
            </Button>
          ) : null}
        </div>
      </header>

      {statusActionError ? (
        <div className="resource-detail-action-error" role="alert">
          {statusActionError}
        </div>
      ) : null}

      <div className="resource-detail-media">
        {areImagesLoading ? (
          <div
            className="resource-detail-media__placeholder"
            role="status"
          >
            <span>Cargando imagen…</span>
          </div>
        ) : currentImage ? (
          <>
            <img
              className="resource-detail-media__image"
              src={currentImage.url}
              alt={resource.name}
            />

            {resourceImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="resource-detail-media__control resource-detail-media__control--previous"
                  aria-label="Imagen anterior"
                  onClick={showPreviousImage}
                >
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className="resource-detail-media__control resource-detail-media__control--next"
                  aria-label="Imagen siguiente"
                  onClick={showNextImage}
                >
                  <ChevronRight size={22} aria-hidden="true" />
                </button>

                <div
                  className="resource-detail-media__counter"
                  aria-live="polite"
                >
                  {displayedImageIndex + 1} / {resourceImages.length}
                </div>

                <div
                  className="resource-detail-media__dots"
                  aria-label="Seleccionar imagen"
                >
                  {resourceImages.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      className={
                        index === displayedImageIndex
                          ? "resource-detail-media__dot resource-detail-media__dot--active"
                          : "resource-detail-media__dot"
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
              </>
            ) : null}
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

      <div className="resource-detail-image-manager">
        <div className="resource-detail-image-manager__copy">
          <strong>Imágenes del recurso</strong>
          <span>
            {resourceImages.length} de {MAX_RESOURCE_IMAGES}
          </span>
        </div>

        <input
          ref={imageInputRef}
          className="resource-detail-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={
            isUploadingImage ||
            resource.status === "ARCHIVED" ||
            resourceImages.length >= MAX_RESOURCE_IMAGES
          }
          onChange={(event) => void handleImageChange(event)}
        />

        <div className="resource-detail-image-manager__actions">
          {currentImage ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  isManagingImage ||
                  resource.status === "ARCHIVED" ||
                  displayedImageIndex === 0
                }
                onClick={() =>
                  void handleMoveCurrentImage("previous")
                }
              >
                <MoveLeft size={16} aria-hidden="true" />
                Mover izquierda
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={
                  isManagingImage ||
                  resource.status === "ARCHIVED" ||
                  displayedImageIndex ===
                    resourceImages.length - 1
                }
                onClick={() =>
                  void handleMoveCurrentImage("next")
                }
              >
                <MoveRight size={16} aria-hidden="true" />
                Mover derecha
              </Button>

              <Button
                type="button"
                variant="danger"
                disabled={
                  isManagingImage ||
                  resource.status === "ARCHIVED"
                }
                onClick={() =>
                  void handleDeleteCurrentImage()
                }
              >
                <Trash2 size={16} aria-hidden="true" />
                {isManagingImage
                  ? "Procesando…"
                  : "Eliminar"}
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            disabled={
              isUploadingImage ||
              isManagingImage ||
              resource.status === "ARCHIVED" ||
              resourceImages.length >= MAX_RESOURCE_IMAGES
            }
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus size={16} aria-hidden="true" />
            {isUploadingImage ? "Subiendo…" : "Agregar imagen"}
          </Button>
        </div>
      </div>

      {imageActionError ? (
        <div
          className="resource-detail-image-error"
          role="alert"
        >
          {imageActionError}
        </div>
      ) : null}
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

          <ResourceAmenitiesEditor
            businessId={TEMP_BUSINESS_ID}
            resource={resource}
            accessToken={session?.accessToken}
          />
        </article>
      </div>
    </section>
  );
}
