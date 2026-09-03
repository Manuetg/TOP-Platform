import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../shared/ui/Button";
import { createBusinessAmenity } from "../api/create-business-amenity";
import type { Amenity } from "../api/list-amenities";
import { setResourceAmenities } from "../api/set-resource-amenities";
import { useAmenities } from "../queries/use-amenities";
import type {
  AmenityCategory,
  Resource,
} from "../types/resource.types";

interface ResourceAmenitiesEditorProps {
  businessId: string;
  resource: Resource;
  accessToken?: string | null;
}

const AMENITY_CATEGORIES: Array<{
  value: AmenityCategory;
  label: string;
}> = [
  { value: "CONNECTIVITY", label: "Conectividad" },
  { value: "CLIMATE", label: "Climatización" },
  { value: "BATHROOM", label: "Baño" },
  { value: "KITCHEN", label: "Cocina" },
  { value: "ENTERTAINMENT", label: "Entretenimiento" },
  { value: "OUTDOOR", label: "Exterior" },
  { value: "PARKING", label: "Estacionamiento" },
  { value: "SERVICES", label: "Servicios" },
  { value: "ACCESSIBILITY", label: "Accesibilidad" },
  { value: "GENERAL", label: "General" },
];

function getCategoryLabel(category: AmenityCategory) {
  return (
    AMENITY_CATEGORIES.find(
      (item) => item.value === category,
    )?.label ?? category
  );
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
  const [customCategory, setCustomCategory] =
    useState<AmenityCategory>("GENERAL");
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
    setCustomCategory("GENERAL");
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
        category: customCategory,
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
      setCustomCategory("GENERAL");

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

        <Button
          type="button"
          variant="secondary"
          onClick={handleStartEditing}
        >
          Gestionar amenities
        </Button>
      </div>
    );
  }

  return (
    <div className="resource-amenities-editor">
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
            <legend>Seleccioná los amenities del recurso</legend>

            {availableAmenities.map((amenity) => (
              <label
                key={amenity.id}
                className="resource-amenities-editor__option"
              >
                <input
                  type="checkbox"
                  checked={selectedAmenityIds.includes(
                    amenity.id,
                  )}
                  onChange={() =>
                    handleToggleAmenity(amenity.id)
                  }
                />

                <span>
                  <strong>{amenity.name}</strong>
                  <small>
                    {getCategoryLabel(amenity.category)}
                    {amenity.scope === "BUSINESS"
                      ? " · Personalizado"
                      : ""}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="resource-detail-empty-copy">
            No hay amenities disponibles.
          </p>
        )
      ) : null}

      <div
        className="resource-amenities-editor__custom"
        aria-labelledby="custom-amenity-title"
      >
        <div>
          <strong id="custom-amenity-title">
            Amenity personalizado
          </strong>
          <p>
            Creá una opción específica para este negocio.
          </p>
        </div>

        <div className="resource-amenities-editor__custom-fields">
          <label>
            <span>Nombre</span>
            <input
              type="text"
              value={customName}
              maxLength={120}
              disabled={isSaving || isCreatingAmenity}
              onChange={(event) => {
                setCustomName(event.target.value);
                setCreateAmenityError(null);
              }}
              placeholder="Ej. Muelle privado"
            />
          </label>

          <label>
            <span>Categoría</span>
            <select
              value={customCategory}
              disabled={isSaving || isCreatingAmenity}
              onChange={(event) =>
                setCustomCategory(
                  event.target.value as AmenityCategory,
                )
              }
            >
              {AMENITY_CATEGORIES.map((category) => (
                <option
                  key={category.value}
                  value={category.value}
                >
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {createAmenityError ? (
          <div
            className="resource-amenities-editor__error"
            role="alert"
          >
            {createAmenityError}
          </div>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          disabled={
            isSaving ||
            isCreatingAmenity ||
            !customName.trim()
          }
          onClick={() => void handleCreateAmenity()}
        >
          {isCreatingAmenity
            ? "Creando…"
            : "Crear amenity personalizado"}
        </Button>
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