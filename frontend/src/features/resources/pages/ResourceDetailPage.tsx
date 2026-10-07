import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import {
  Building2,
  Ban,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ImagePlus,
  ImageOff,
  Hotel,
  LayoutDashboard,
  Pencil,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Badge } from "../../../shared/ui/Badge";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
import { TopBreadcrumb } from "../../../shared/ui/TopBreadcrumb";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { deleteResourceImage } from "../api/delete-resource-image";
import { disableResource } from "../api/disable-resource";
import { reactivateResource } from "../api/reactivate-resource";
import { uploadResourceImage } from "../api/upload-resource-image";
import { ResourceAmenitiesEditor } from "../components/ResourceAmenitiesEditor";
import { ResourceAvailabilityCalendar } from "../components/ResourceAvailabilityCalendar";
import { EditResourcePage } from "./EditResourcePage";
import { useResourceImages } from "../queries/use-resource-images";
import { useResource } from "../queries/use-resource";
import type { ResourceStatus } from "../types/resource.types";
import "./ResourceDetailPage.css";


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
  const { resourceId } = useParams();
  const { activeBusinessId, activeRole } = useBusinessContext();
  const { session } = useAuth();
  return <ResourceDetailContent key={`${session?.user.id}:${activeBusinessId}:${resourceId}:${activeRole}`} />;
}
function ResourceDetailContent() {
  const queryClient = useQueryClient();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusiness, activeBusinessId, activeRole } = useBusinessContext();
  const canManageResource = activeRole === "OWNER" || activeRole === "ADMIN";
  const canOperate = canManageResource || activeRole === "RECEPTIONIST";
  const mounted = useRef(true);
  const statusBusy = useRef(false);
  const uploadBusy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(
    null,
  );

  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const editRevision = useRef(0);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);
  const deleteOperation = useRef<AbortController | null>(null);
  useEffect(() => () => deleteOperation.current?.abort(), []);
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
    businessId: activeBusinessId,
    resourceId,
    accessToken: session?.accessToken,
  });

  const {
    data: resourceImages = [],
    isLoading: areImagesLoading,
    isError: imagesHaveError,
    refetch: refetchImages,
  } = useResourceImages({
    businessId: activeBusinessId,
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
    ? failedImageIds.has(`${currentImage.id}:${currentImage.url}`)
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

    if (!file || !resource || !canManageResource || resource.status === "ARCHIVED" || uploadBusy.current || areImagesLoading || imagesHaveError) {
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

    uploadBusy.current = true;
    setIsUploadingImage(true);

    try {
      const uploadedImage = await uploadResourceImage({
        businessId: activeBusinessId,
        resourceId: resource.id,
        file,
        accessToken: session?.accessToken,
      });
      if (!mounted.current) return;

      const imageQueryKey = [
        "resources",
        activeBusinessId,
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
      if (!mounted.current) return;
      setImageActionError(
        uploadError instanceof Error
          ? uploadError.message
          : "No pudimos subir la imagen.",
      );
    } finally {
      uploadBusy.current = false;
      if (mounted.current) setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleDeleteCurrentImage() {
    const imageToDelete = resourceImages.find((image) => image.id === deleteImageId);
    if (
      !resource ||
      !imageToDelete ||
      !canManageResource ||
      isManagingImage ||
      deleteOperation.current !== null ||
      resource.status === "ARCHIVED"
    ) {
      return;
    }


    const imageQueryKey = [
      "resources",
      activeBusinessId,
      resource.id,
      "images",
    ];

    const controller = new AbortController(); deleteOperation.current = controller;
    setImageActionError(null);
    setIsManagingImage(true);

    try {
      await deleteResourceImage({
        businessId: activeBusinessId,
        resourceId: resource.id,
        imageId: imageToDelete.id,
        signal: controller.signal,
        accessToken: session?.accessToken,
      });

      if (controller.signal.aborted) return;
      const remainingImages = resourceImages
        .filter((image) => image.id !== imageToDelete.id)
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
      setDeleteOpen(false);

      await queryClient.invalidateQueries({
        queryKey: imageQueryKey,
        exact: true,
      });
    } catch (deleteError) {
      if (controller.signal.aborted) return;
      setImageActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "No pudimos eliminar la imagen.",
      );
    } finally {
      if (!controller.signal.aborted) { deleteOperation.current = null; setIsManagingImage(false); }
    }
  }

  async function handleDisableResource() {
    if (!resource || !canManageResource || resource.status !== "ACTIVE" || statusBusy.current) {
      return;
    }

    statusBusy.current = true;
    setStatusActionError(null);
    setIsUpdatingStatus(true);

    try {
      const updatedResource = await disableResource({
        businessId: activeBusinessId,
        resourceId: resource.id,
        accessToken: session?.accessToken,
      });
      if (!mounted.current) return;

      queryClient.setQueryData(
        ["resources", activeBusinessId, resource.id],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", activeBusinessId],
        exact: true,
      });
    } catch (disableResourceError) {
      if (!mounted.current) return;
      setStatusActionError(
        disableResourceError instanceof Error
          ? disableResourceError.message
          : "No pudimos poner el recurso fuera de servicio.",
      );
    } finally {
      statusBusy.current = false;
      if (mounted.current) setIsUpdatingStatus(false);
    }
  }

  async function handleReactivateResource() {
    if (!resource || !canManageResource || resource.status !== "OUT_OF_SERVICE" || statusBusy.current) {
      return;
    }

    statusBusy.current = true;
    setStatusActionError(null);
    setIsUpdatingStatus(true);

    try {
      const updatedResource = await reactivateResource({
        businessId: activeBusinessId,
        resourceId: resource.id,
        accessToken: session?.accessToken,
      });
      if (!mounted.current) return;

      queryClient.setQueryData(
        ["resources", activeBusinessId, resource.id],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", activeBusinessId],
        exact: true,
      });
    } catch (reactivateResourceError) {
      if (!mounted.current) return;
      setStatusActionError(
        reactivateResourceError instanceof Error
          ? reactivateResourceError.message
          : "No pudimos reactivar el recurso.",
      );
    } finally {
      statusBusy.current = false;
      if (mounted.current) setIsUpdatingStatus(false);
    }
  }

  if (!activeBusinessId || !resourceId) {
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
        <TopBreadcrumb
          items={[
            { label: "Inicio", href: "/app", icon: LayoutDashboard },
            { label: "Recursos", href: "/app/resources", icon: Hotel },
            { label: "Recurso", current: true },
          ]}
        />

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

  const canManageImages = canManageResource && resource.status !== "ARCHIVED";
  const renderedEditRevision = editRevision.current;
  function closeEdit() {
    editRevision.current += 1;
    setEditOpen(false);
  }

  return (
    <section
      className="resource-detail-page"
      aria-labelledby="resource-detail-title"
    >
      <TopBreadcrumb
        items={[
          { label: "Inicio", href: "/app", icon: LayoutDashboard },
          { label: "Recursos", href: "/app/resources", icon: Hotel },
          { label: resource.name, current: true },
        ]}
      />

      <header className="resource-detail-header">
        <div className="resource-detail-title-group">
          <p className="resource-detail-eyebrow">Detalle del recurso</p>
          <h1 id="resource-detail-title">{resource.name}</h1>
          <div className="resource-detail-status-control">
            <span>Estado operativo</span>
            <Badge tone={resource.status === "ACTIVE" ? "success" : resource.status === "OUT_OF_SERVICE" ? "warning" : "neutral"}>
              {getResourceStatusLabel(resource.status)}
            </Badge>
          {canManageResource && resource.status !== "ARCHIVED" ? (
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
              isUpdatingStatus
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
          ) : null}
          {isUpdatingStatus ? <span role="status">Actualizando estado…</span> : null}
          </div>
        </div>

        {canManageResource && resource.status !== "ARCHIVED" ? (
        <button
          type="button"
          className="resource-detail-edit-button"
          aria-label="Editar recurso"
          ref={editTrigger}
          onClick={() => { editRevision.current += 1; setEditOpen(true); }}
        >
          <Pencil size={20} aria-hidden="true" />
          <span>Editar recurso</span>
        </button>
        ) : null}
      </header>

      {statusActionError ? (
        <div className="resource-detail-action-error" role="alert">
          {statusActionError}
        </div>
      ) : null}

        <article
          className="resource-detail-card resource-detail-actions-card"
          aria-label="Acciones"
        >
          <h2>Acciones</h2>
          <div className="resource-detail-quick-actions">
            {canOperate && resource.status === "ACTIVE" ? (
            <Link
              to="/app/calendar"
              className="resource-detail-quick-action resource-detail-quick-action--primary"
            >
              <CalendarPlus size={16} aria-hidden="true" />
              <span>Crear reserva</span>
            </Link>
            ) : null}

            <Link
              to="/app/availability"
              className="resource-detail-quick-action"
            >
              <Gauge size={16} aria-hidden="true" />
              <span>Consultar disponibilidad</span>
            </Link>

            {canOperate && resource.status !== "ARCHIVED" ? <Link
              to="/app/blocks/new"
              className="resource-detail-quick-action"
            >
              <Ban size={16} aria-hidden="true" />
              <span>Crear bloqueo</span>
            </Link> : null}

            <Link
              to="/app/payments"
              className="resource-detail-quick-action"
            >
              <WalletCards size={16} aria-hidden="true" />
              <span>Ver pagos por reserva</span>
            </Link>
          </div>
        </article>

      <div className="resource-detail-layout">
        <article className="resource-detail-card resource-detail-info-card">
          <h2>Información del recurso</h2>
          <dl className="resource-detail-info-list">
            <div>
              <dt>Código</dt>
              <dd>{resource.internalCode}</dd>
            </div>
            <div>
              <dt>Capacidad total</dt>
              <dd>{resource.capacityMinimum}–{resource.capacityMaximum} huéspedes</dd>
            </div>
            <div>
              <dt>Máximo de niños</dt>
              <dd>{resource.capacityMaximumChildren} dentro de la capacidad total</dd>
            </div>
            <div className="resource-detail-info-list__description">
              <dt>Descripción</dt>
              <dd>{resource.description?.trim() ? resource.description : "Sin descripción configurada."}</dd>
            </div>
          </dl>
        </article>
        <article className="resource-detail-card resource-detail-media-card">
          <h2>Fotos</h2>
          <div className="resource-detail-media">
            {areImagesLoading ? (
              <div
                className="resource-detail-media__placeholder"
                role="status"
              >
                <Building2 size={32} aria-hidden="true" />
                <span>Cargando imagen…</span>
              </div>
            ) : imagesHaveError ? (
              <div className="resource-detail-media__placeholder" role="alert">
                <ImageOff size={32} aria-hidden="true" />
                <strong>No pudimos cargar las fotos.</strong>
                <Button type="button" variant="secondary" onClick={() => void refetchImages()}>Reintentar fotos</Button>
              </div>
            ) : currentImageFailed ? (
              <div className="resource-detail-media__placeholder" role="group" aria-label={`Imagen de ${resource.name} no disponible`}>
                <ImageOff size={32} aria-hidden="true" />
                <strong>Esta imagen no está disponible.</strong>
                <span>Puedes recorrer las demás fotos o reintentar.</span>
                <Button type="button" variant="secondary" onClick={() => {
                  setFailedImageIds((current) => {
                    const next = new Set(current);
                    if (currentImage) next.delete(`${currentImage.id}:${currentImage.url}`);
                    return next;
                  });
                  void refetchImages();
                }}>Reintentar imagen</Button>
              </div>
            ) : currentImage ? (
              <>
                <img
                  className="resource-detail-media__image"
                  src={currentImage.url}
                  alt={resource.name}
                  onError={() => {
                    setFailedImageIds((current) => {
                      const next = new Set(current);
                      next.add(`${currentImage.id}:${currentImage.url}`);
                      return next;
                    });
                  }}
                />

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
            {currentImage && canManageImages && !areImagesLoading && !imagesHaveError ? <button
              type="button"
              className="resource-detail-icon-button resource-detail-icon-button--overlay resource-detail-icon-button--danger"
              aria-label="Eliminar imagen"
              title="Eliminar imagen"
              disabled={isManagingImage || isUploadingImage}
              ref={deleteTrigger}
              onClick={() => { setImageActionError(null); setDeleteImageId(currentImage.id); setDeleteOpen(true); }}
            ><Trash2 size={20} aria-hidden="true" /></button> : null}
          </div>

          <footer className="resource-detail-media-toolbar">
            <span
              className="resource-detail-media-count"
              aria-live="polite"
            >
              {areImagesLoading || imagesHaveError ? "" : resourceImages.length > 0
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
                tabIndex={-1}
                aria-hidden="true"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  areImagesLoading || imagesHaveError ||
                  isUploadingImage ||
                  isManagingImage ||
                  !canManageImages ||
                  resourceImages.length >= MAX_RESOURCE_IMAGES
                }
                onChange={(event) => void handleImageChange(event)}
              />

              {canManageImages ? <button
                type="button"
                className="resource-detail-icon-button"
                aria-label={
                  isUploadingImage
                    ? "Subiendo imagen"
                    : "Agregar imagen"
                }
                title="Agregar imagen"
                disabled={
                  areImagesLoading || imagesHaveError ||
                  isUploadingImage ||
                  isManagingImage ||
                  !canManageImages ||
                  resourceImages.length >= MAX_RESOURCE_IMAGES
                }
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={20} aria-hidden="true" />
              </button> : null}
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

        <article className="resource-detail-card resource-detail-amenities-card">
          <h2>Amenidades</h2>

          <ResourceAmenitiesEditor
            businessId={activeBusinessId}
            resource={resource}
            accessToken={session?.accessToken}
            canManage={canManageImages}
          />
        </article>

      {activeBusiness ? (
        <ResourceAvailabilityCalendar
          businessId={activeBusiness.id}
          resourceId={resource.id}
          resourceName={resource.name}
          timezone={activeBusiness.timezone}
          accessToken={session?.accessToken}
        />
      ) : null}
      </div>

      {resource.status !== "ACTIVE" ? <p className="resource-detail-operational-note">{resource.status === "ARCHIVED" ? "Este recurso está archivado. Puedes consultar su información y su agenda." : "Este recurso está fuera de servicio. La disponibilidad se consulta para un rango de fechas."}</p> : null}



      <OverlayPanel
        open={editOpen}
        portal
        motion="dialog"
        label="Editar recurso"
        closeLabel="Cerrar edición"
        className="resource-edit-dialog"
        layerClassName="resource-edit-dialog-layer"
        triggerRef={editTrigger}
        onClose={closeEdit}
      >
        <EditResourcePage
          key={renderedEditRevision}
          embedded
          onClose={() => {
            if (mounted.current && editRevision.current === renderedEditRevision) closeEdit();
          }}
        />
      </OverlayPanel>
      <ConfirmDialog open={deleteOpen} title="Eliminar imagen" description={`Vas a eliminar esta imagen de ${resource.name}. Las demás imágenes se conservan.`} confirmLabel="Eliminar imagen" destructive disabled={!resourceImages.some((image) => image.id === deleteImageId)} triggerRef={deleteTrigger} loading={isManagingImage} error={imageActionError} onCancel={() => setDeleteOpen(false)} onConfirm={() => void handleDeleteCurrentImage()} />
    </section>
  );
}
