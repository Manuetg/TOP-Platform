import {
  Check,
  Pencil,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../shared/ui/Button";
import { createBusinessAmenity } from "../api/create-business-amenity";
import type { Amenity } from "../api/list-amenities";
import { setResourceAmenities } from "../api/set-resource-amenities";
import { useAmenities } from "../queries/use-amenities";
import type { Resource } from "../types/resource.types";

interface ResourceAmenitiesEditorProps {
  businessId: string;
  resource: Resource;
  accessToken?: string | null;
}

export function ResourceAmenitiesEditor({
  businessId,
  resource,
  accessToken,
}: ResourceAmenitiesEditorProps) {
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>(
    resource.amenities.map((amenity) => amenity.id),
  );
  const [locallyCreatedAmenities, setLocallyCreatedAmenities] = useState<
    Amenity[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [customName, setCustomName] = useState("");
  const [isCreatingAmenity, setIsCreatingAmenity] = useState(false);
  const [createAmenityError, setCreateAmenityError] = useState<
    string | null
  >(null);

  const {
    data: amenities = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAmenities({
    businessId,
    accessToken,
  });

  const availableAmenities = useMemo(() => {
    const knownIds = new Set(amenities.map((amenity) => amenity.id));

    return [
      ...amenities,
      ...locallyCreatedAmenities.filter(
        (amenity) => !knownIds.has(amenity.id),
      ),
    ];
  }, [amenities, locallyCreatedAmenities]);

  useEffect(() => {
    if (!isEditing) {
      setSelectedAmenityIds(
        resource.amenities.map((amenity) => amenity.id),
      );
    }
  }, [isEditing, resource.amenities]);

  function handleStartEditing() {
    setSelectedAmenityIds(
      resource.amenities.map((amenity) => amenity.id),
    );
    setSaveError(null);
    setCreateAmenityError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setSelectedAmenityIds(
      resource.amenities.map((amenity) => amenity.id),
    );
    setSaveError(null);
    setCreateAmenityError(null);
    setCustomName("");
    setIsEditing(false);
  }

  function handleToggleAmenity(amenityId: string) {
    setSelectedAmenityIds((current) =>
      current.includes(amenityId)
        ? current.filter((id) => id !== amenityId)
        : [...current, amenityId],
    );
  }

  async function handleCreateAmenity() {
    const normalizedName = customName.trim();

    if (!normalizedName) {
      setCreateAmenityError(
        "Ingresá un nombre para el amenity personalizado.",
      );
      return;
    }

    if (normalizedName.length > 120) {
      setCreateAmenityError(
        "El nombre no puede superar 120 caracteres.",
      );
      return;
    }

    setCreateAmenityError(null);
    setIsCreatingAmenity(true);

    try {
      const createdAmenity = await createBusinessAmenity({
        businessId,
        name: normalizedName,
        category: "GENERAL",
        accessToken,
      });

      setLocallyCreatedAmenities((current) => [
        ...current.filter(
          (amenity) => amenity.id !== createdAmenity.id,
        ),
        createdAmenity,
      ]);

      setSelectedAmenityIds((current) =>
        current.includes(createdAmenity.id)
          ? current
          : [...current, createdAmenity.id],
      );

      setCustomName("");

      await queryClient.invalidateQueries({
        queryKey: ["amenities", businessId],
        exact: true,
      });
    } catch (createError) {
      setCreateAmenityError(
        createError instanceof Error
          ? createError.message
          : "No pudimos crear el amenity personalizado.",
      );
    } finally {
      setIsCreatingAmenity(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);

    try {
      const updatedResource = await setResourceAmenities({
        businessId,
        resourceId: resource.id,
        amenityIds: selectedAmenityIds,
        accessToken,
      });

      queryClient.setQueryData(
        ["resources", businessId, resource.id],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", businessId],
        exact: true,
      });

      setIsEditing(false);
    } catch (setAmenitiesError) {
      setSaveError(
        setAmenitiesError instanceof Error
          ? setAmenitiesError.message
          : "No pudimos guardar los amenities.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <div className="resource-amenities-view">
        <button
          type="button"
          className="resource-detail-icon-button resource-amenities-view__edit"
          aria-label="Gestionar amenities"
          onClick={handleStartEditing}
        >
          <Pencil size={20} aria-hidden="true" />
        </button>

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
      </div>
    );
  }

  return (
    <div className="resource-amenities-editor">
      <div className="resource-amenities-editor__intro">
        <strong>Seleccionar amenities</strong>
        <p>Elegí los que correspondan a este recurso.</p>
      </div>

      {isLoading ? (
        <p
          className="resource-amenities-editor__status"
          role="status"
        >
          Cargando amenities…
        </p>
      ) : null}

      {isError ? (
        <div
          className="resource-amenities-editor__error"
          role="alert"
        >
          <p>
            {error instanceof Error
              ? error.message
              : "No pudimos cargar los amenities."}
          </p>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError ? (
        availableAmenities.length > 0 ? (
          <fieldset
            className="resource-amenities-editor__options"
            disabled={isSaving || isCreatingAmenity}
          >
            <legend className="resource-detail-visually-hidden">
              Amenities disponibles
            </legend>

            {availableAmenities.map((amenity) => {
              const isSelected = selectedAmenityIds.includes(
                amenity.id,
              );

              return (
                <label
                  key={amenity.id}
                  className={
                    isSelected
                      ? "resource-amenities-editor__option resource-amenities-editor__option--selected"
                      : "resource-amenities-editor__option"
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                      handleToggleAmenity(amenity.id)
                    }
                  />

                  <span>{amenity.name}</span>

                  {isSelected ? (
                    <Check size={16} aria-hidden="true" />
                  ) : null}
                </label>
              );
            })}
          </fieldset>
        ) : (
          <p className="resource-detail-empty-copy">
            No hay amenities disponibles.
          </p>
        )
      ) : null}

      <div className="resource-amenities-editor__custom">
        <label htmlFor="resource-custom-amenity">
          Nuevo amenity
        </label>

        <div className="resource-amenities-editor__custom-row">
          <input
            id="resource-custom-amenity"
            className="top-input"
            type="text"
            aria-label="Nombre"
            value={customName}
            maxLength={120}
            disabled={isSaving || isCreatingAmenity}
            onChange={(event) => {
              setCustomName(event.target.value);
              setCreateAmenityError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                if (
                  customName.trim() &&
                  !isSaving &&
                  !isCreatingAmenity
                ) {
                  void handleCreateAmenity();
                }
              }
            }}
            placeholder="Ej. Muelle privado"
          />

          <button
            type="button"
            className="resource-detail-icon-button"
            aria-label="Crear amenity personalizado"
            disabled={
              isSaving ||
              isCreatingAmenity ||
              !customName.trim()
            }
            onClick={() => void handleCreateAmenity()}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>

        {createAmenityError ? (
          <div
            className="resource-amenities-editor__error"
            role="alert"
          >
            {createAmenityError}
          </div>
        ) : null}
      </div>

      {saveError ? (
        <div
          className="resource-amenities-editor__error"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}

      <div className="resource-amenities-editor__actions">
        <Button
          type="button"
          variant="secondary"
          disabled={isSaving || isCreatingAmenity}
          onClick={handleCancel}
        >
          Cancelar
        </Button>

        <Button
          type="button"
          disabled={
            isSaving ||
            isCreatingAmenity ||
            isLoading ||
            isError
          }
          onClick={() => void handleSave()}
        >
          {isSaving ? "Guardando…" : "Guardar amenities"}
        </Button>
      </div>
    </div>
  );
}
