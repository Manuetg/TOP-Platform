import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { createResource } from "../api/create-resource";
import {
  createResourceSchema,
  type CreateResourceFormInput,
  type CreateResourceFormValues,
} from "../schemas/create-resource.schema";
import "./CreateResourcePage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function createInternalCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function CreateResourcePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateResourceFormInput, unknown, CreateResourceFormValues>({
    resolver: zodResolver(createResourceSchema),
    defaultValues: {
      name: "",
      internalCode: "",
      description: "",
      capacityMinimum: 1,
      capacityMaximum: 4,
      capacityMaximumChildren: 0,
      sortOrder: 0,
    },
  });

  
  const resourceName = watch("name");

  useEffect(() => {
    setValue(
      "internalCode",
      createInternalCode(resourceName ?? ""),
      {
        shouldValidate: false,
        shouldDirty: false,
      },
    );
  }, [resourceName, setValue]);
const onSubmit = handleSubmit(async (values) => {
    if (!TEMP_BUSINESS_ID) {
      setSubmitError(
        "No se pudo determinar el Business activo.",
      );
      return;
    }

    setSubmitError(null);

    try {
      const resource = await createResource({
        businessId: TEMP_BUSINESS_ID,
        accessToken: session?.accessToken,
        input: {
          name: values.name.trim(),
          internalCode: values.internalCode
            .trim()
            .toUpperCase(),
          description: values.description?.trim()
            ? values.description.trim()
            : null,
          capacityMinimum: values.capacityMinimum,
          capacityMaximum: values.capacityMaximum,
          capacityMaximumChildren:
            values.capacityMaximumChildren,
          sortOrder: values.sortOrder,
        },
      });

      navigate(`/app/resources/${resource.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No pudimos crear el recurso.",
      );
    }
  });

  return (
    <section
      className="resource-create-page"
      aria-labelledby="resource-create-title"
    >
      <button
        type="button"
        className="resource-create-back"
        onClick={() => navigate("/app/resources")}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a Recursos
      </button>

      <header className="resource-create-header">
        <span className="resource-create-eyebrow">
          Recursos
        </span>

        <h1 id="resource-create-title">
          Nuevo recurso
        </h1>

        <p>
          Creá una unidad operativa para administrar
          disponibilidad, reservas y configuración.
        </p>
      </header>

      <form
        className="resource-create-form"
        onSubmit={onSubmit}
        noValidate
      >
        <section className="resource-create-card">
          <div className="resource-create-card__header">
            <h2>Información general</h2>
            <p>
              Identificación principal de la unidad.
            </p>
          </div>

          <div className="resource-create-fields">
            <label className="resource-create-field">
              <span>Nombre</span>

              <input
                type="text"
                autoComplete="off"
                aria-invalid={
                  errors.name ? "true" : "false"
                }
                {...register("name")}
              />

              {errors.name && (
                <small role="alert">
                  {errors.name.message}
                </small>
              )}
            </label>

            <label className="resource-create-field">
              <span>Código interno</span>

              <input
                type="text"
                autoComplete="off"
                readOnly
                aria-describedby="resource-internal-code-help"
                aria-invalid={
                  errors.internalCode ? "true" : "false"
                }
                {...register("internalCode")}
              />

              <small
                id="resource-internal-code-help"
                className="resource-create-field__help"
              >
                Se genera automáticamente a partir del nombre.
              </small>

              {errors.internalCode && (
                <small role="alert">
                  {errors.internalCode.message}
                </small>
              )}
            </label>

            <label className="resource-create-field resource-create-field--full">
              <span>Descripción</span>

              <textarea
                rows={4}
                aria-invalid={
                  errors.description ? "true" : "false"
                }
                {...register("description")}
              />

              {errors.description && (
                <small role="alert">
                  {errors.description.message}
                </small>
              )}
            </label>
          </div>
        </section>

        <section className="resource-create-card">
          <div className="resource-create-card__header">
            <h2>Capacidad</h2>
            <p>
              Definí los límites básicos de ocupación.
            </p>
          </div>

          <div className="resource-create-fields resource-create-fields--three">
            <label className="resource-create-field">
              <span>Mínimo</span>

              <input
                type="number"
                min="1"
                {...register("capacityMinimum")}
              />

              {errors.capacityMinimum && (
                <small role="alert">
                  {errors.capacityMinimum.message}
                </small>
              )}
            </label>

            <label className="resource-create-field">
              <span>Máximo</span>

              <input
                type="number"
                min="1"
                max="50"
                {...register("capacityMaximum")}
              />

              {errors.capacityMaximum && (
                <small role="alert">
                  {errors.capacityMaximum.message}
                </small>
              )}
            </label>

            <label className="resource-create-field">
              <span>Máximo de niños</span>

              <input
                type="number"
                min="0"
                {...register("capacityMaximumChildren")}
              />

              {errors.capacityMaximumChildren && (
                <small role="alert">
                  {
                    errors.capacityMaximumChildren
                      .message
                  }
                </small>
              )}
            </label>
          </div>
        </section>

        <section className="resource-create-card">
          <div className="resource-create-card__header">
            <h2>Orden</h2>
            <p>
              Posición utilizada para organizar recursos.
            </p>
          </div>

          <div className="resource-create-fields">
            <label className="resource-create-field">
              <span>Posición</span>

              <input
                type="number"
                min="0"
                max="9999"
                {...register("sortOrder")}
              />

              {errors.sortOrder && (
                <small role="alert">
                  {errors.sortOrder.message}
                </small>
              )}
            </label>
          </div>
        </section>

        {submitError && (
          <div
            className="resource-create-error"
            role="alert"
          >
            {submitError}
          </div>
        )}

        <footer className="resource-create-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/app/resources")}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            <Plus size={16} aria-hidden="true" />
            {isSubmitting
              ? "Creando…"
              : "Crear recurso"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
