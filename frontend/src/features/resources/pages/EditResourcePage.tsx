import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { updateResource } from "../api/update-resource";
import { useResource } from "../queries/use-resource";
import {
  editResourceSchema,
  type EditResourceFormInput,
  type EditResourceFormValues,
} from "../schemas/edit-resource.schema";
import "./EditResourcePage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

export function EditResourcePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();

  const [submitError, setSubmitError] =
    useState<string | null>(null);

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
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<
    EditResourceFormInput,
    unknown,
    EditResourceFormValues
  >({
    resolver: zodResolver(editResourceSchema),
  });

  useEffect(() => {
    if (!resource) {
      return;
    }

    reset({
      name: resource.name,
      internalCode: resource.internalCode,
      description: resource.description ?? "",
      capacityMinimum: resource.capacityMinimum,
      capacityMaximum: resource.capacityMaximum,
      capacityMaximumChildren:
        resource.capacityMaximumChildren,
      sortOrder: resource.sortOrder,
    });
  }, [resource, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!TEMP_BUSINESS_ID || !resourceId) {
      setSubmitError(
        "No se pudo determinar el recurso activo.",
      );
      return;
    }

    setSubmitError(null);

    try {
      const updatedResource = await updateResource({
        businessId: TEMP_BUSINESS_ID,
        resourceId,
        accessToken: session?.accessToken,
        input: {
          name: values.name.trim(),
          internalCode: values.internalCode
            .trim()
            .toUpperCase(),
          description: values.description.trim()
            ? values.description.trim()
            : null,
          capacityMinimum: values.capacityMinimum,
          capacityMaximum: values.capacityMaximum,
          capacityMaximumChildren:
            values.capacityMaximumChildren,
          sortOrder: values.sortOrder,
        },
      });

      queryClient.setQueryData(
        ["resources", TEMP_BUSINESS_ID, resourceId],
        updatedResource,
      );

      await queryClient.invalidateQueries({
        queryKey: ["resources", TEMP_BUSINESS_ID],
        exact: true,
      });

      navigate(`/app/resources/${resourceId}`);
    } catch (submitErrorValue) {
      setSubmitError(
        submitErrorValue instanceof Error
          ? submitErrorValue.message
          : "No pudimos guardar los cambios.",
      );
    }
  });

  if (isLoading) {
    return (
      <section className="resource-edit-page">
        <div
          className="resource-edit-state"
          role="status"
        >
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
      <section className="resource-edit-page">
        <div
          className="resource-edit-error"
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

  return (
    <section
      className="resource-edit-page"
      aria-labelledby="resource-edit-title"
    >
      <button
        type="button"
        className="resource-edit-back"
        onClick={() =>
          navigate(`/app/resources/${resource.id}`)
        }
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al recurso
      </button>

      <header className="resource-edit-header">
        <span className="resource-edit-eyebrow">
          Recursos
        </span>

        <h1 id="resource-edit-title">
          Editar recurso
        </h1>

        <p>
          Actualizá la información operativa básica de{" "}
          <strong>{resource.name}</strong>.
        </p>
      </header>

      <form
        className="resource-edit-form"
        onSubmit={onSubmit}
        noValidate
      >
        <section className="resource-edit-card">
          <div className="resource-edit-card__header">
            <h2>Información general</h2>
            <p>
              Nombre, código interno y descripción.
            </p>
          </div>

          <div className="resource-edit-fields">
            <label className="resource-edit-field">
              <span>Nombre</span>

              <input
                type="text"
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

            <label className="resource-edit-field">
              <span>Código interno</span>

              <input
                type="text"
                aria-invalid={
                  errors.internalCode ? "true" : "false"
                }
                {...register("internalCode")}
              />

              <small className="resource-edit-field__help">
                Cambialo solo si necesitás corregir el
                identificador operativo.
              </small>

              {errors.internalCode && (
                <small role="alert">
                  {errors.internalCode.message}
                </small>
              )}
            </label>

            <label className="resource-edit-field resource-edit-field--full">
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

        <section className="resource-edit-card">
          <div className="resource-edit-card__header">
            <h2>Capacidad</h2>
            <p>
              Ajustá los límites de ocupación.
            </p>
          </div>

          <div className="resource-edit-fields resource-edit-fields--three">
            <label className="resource-edit-field">
              <span>Mínimo</span>

              <input
                type="number"
                min="1"
                max="50"
                {...register("capacityMinimum")}
              />

              {errors.capacityMinimum && (
                <small role="alert">
                  {errors.capacityMinimum.message}
                </small>
              )}
            </label>

            <label className="resource-edit-field">
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

            <label className="resource-edit-field">
              <span>Máximo de niños</span>

              <input
                type="number"
                min="0"
                max="50"
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

        <section className="resource-edit-card">
          <div className="resource-edit-card__header">
            <h2>Orden</h2>
            <p>
              Posición utilizada para organizar recursos.
            </p>
          </div>

          <div className="resource-edit-fields">
            <label className="resource-edit-field">
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
            className="resource-edit-error"
            role="alert"
          >
            {submitError}
          </div>
        )}

        <footer className="resource-edit-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate(`/app/resources/${resource.id}`)
            }
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            <Save size={16} aria-hidden="true" />

            {isSubmitting
              ? "Guardando…"
              : "Guardar cambios"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
