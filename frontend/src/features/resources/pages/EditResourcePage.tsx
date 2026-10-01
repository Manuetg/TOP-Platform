import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useIsPresent } from "motion/react";
import { useForm } from "react-hook-form";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { updateResource } from "../api/update-resource";
import { useResource } from "../queries/use-resource";
import {
  editResourceSchema,
  type EditResourceFormInput,
  type EditResourceFormValues,
} from "../schemas/edit-resource.schema";
import "./EditResourcePage.css";


interface EditResourcePageProps {
  embedded?: boolean;
  onClose?: () => void;
}

export function EditResourcePage({
  embedded = false,
  onClose,
}: EditResourcePageProps = {}) {
  const navigate = useNavigate();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId, activeRole } = useBusinessContext();
  const canEdit = Boolean(session && activeBusinessId && resourceId &&
    (activeRole === "OWNER" || activeRole === "ADMIN"));

  if (!canEdit) {
    return <section className="resource-edit-page">
      <div className="resource-edit-error" role="alert">
        <p>No tienes permiso para editar este recurso.</p>
        <Button variant="secondary" onClick={() => {
          if (embedded) onClose?.();
          else navigate(resourceId ? `/app/resources/${resourceId}` : "/app/resources");
        }}>{embedded ? "Cerrar edición" : "Volver al recurso"}</Button>
      </div>
    </section>;
  }

  return <EditResourceContent
    key={`${session?.user.id}:${activeBusinessId}:${resourceId}:${activeRole}`}
    embedded={embedded}
    onClose={onClose}
  />;
}

function EditResourceContent({ embedded, onClose }: EditResourcePageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resourceId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId, activeRole } = useBusinessContext();
  const isPresent = useIsPresent();
  const scope = `${session?.user.id}:${activeBusinessId}:${resourceId}:${activeRole}`;
  const currentScope = useRef(scope);
  const present = useRef(isPresent);
  currentScope.current = scope;
  present.current = isPresent;
  const alive = useRef(false);
  const closing = useRef(false);
  const locked = useRef(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; operation.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!isPresent) operation.current?.abort();
  }, [isPresent]);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current || closing.current || !present.current) return;
    locked.current = true;
    void handleSubmit(async (values) => {
      if (!alive.current || closing.current || !present.current || currentScope.current !== scope ||
        !session || !activeBusinessId || !resourceId || !["OWNER", "ADMIN"].includes(activeRole ?? "")) return;

      const controller = new AbortController();
      operation.current = controller;
      const isCurrent = () => alive.current && !closing.current && present.current &&
        currentScope.current === scope && operation.current === controller && !controller.signal.aborted;
      setSubmitError(null);

      try {
        const updatedResource = await updateResource({
          businessId: activeBusinessId,
          resourceId,
          accessToken: session.accessToken,
          signal: controller.signal,
          input: {
            name: values.name.trim(),
            internalCode: values.internalCode.trim().toUpperCase(),
            description: values.description.trim() || null,
            capacityMinimum: values.capacityMinimum,
            capacityMaximum: values.capacityMaximum,
            capacityMaximumChildren: values.capacityMaximumChildren,
            sortOrder: values.sortOrder,
          },
        });
        if (!isCurrent()) return;

        queryClient.setQueryData(
          ["resources", activeBusinessId, resourceId], updatedResource,
        );
        await queryClient.invalidateQueries({
          queryKey: ["resources", activeBusinessId], exact: true,
        });
        if (!isCurrent()) return;

        if (embedded) onClose?.();
        else navigate(`/app/resources/${resourceId}`);
      } catch (submitErrorValue) {
        if (!isCurrent()) return;
        setSubmitError(
          submitErrorValue instanceof Error
            ? submitErrorValue.message
            : "No pudimos guardar los cambios.",
        );
      } finally {
        if (operation.current === controller) operation.current = null;
      }
    })(event).finally(() => { locked.current = false; });
  };

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

  const returnToResource = () => {
    closing.current = true;
    operation.current?.abort();
    if (embedded) {
      onClose?.();
      return;
    }

    navigate(`/app/resources/${resource.id}`);
  };

  return (
    <section
      className={`resource-edit-page${embedded ? " resource-edit-page--dialog" : ""}`}
      aria-labelledby="resource-edit-title"
    >
      {!embedded ? (
        <button
          type="button"
          className="resource-edit-back"
          onClick={returnToResource}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Recursos
        </button>
      ) : null}

      <header className="resource-edit-header">
        <div>
          <h1 id="resource-edit-title">
            Editar recurso
          </h1>

          <p>
            Actualizá la información de{" "}
            <strong>{resource.name}</strong>.
          </p>
        </div>

        {embedded ? (
          <button
            type="button"
            className="resource-edit-close"
            aria-label="Cerrar edición"
            onClick={returnToResource}
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <form
        className="resource-edit-form"
        onSubmit={onSubmit}
        noValidate
      >
        <input
          type="hidden"
          {...register("sortOrder")}
        />

        <div className="resource-edit-surface">
          <section
            className="resource-edit-section"
            aria-labelledby="resource-edit-general-title"
          >
            <div className="resource-edit-section__header">
              <h2 id="resource-edit-general-title">
                Información general
              </h2>

              <p>
                Datos principales utilizados para identificar
                este recurso.
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
                    errors.internalCode
                      ? "true"
                      : "false"
                  }
                  {...register("internalCode")}
                />

                <small className="resource-edit-field__help">
                  Identificador operativo del recurso.
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
                    errors.description
                      ? "true"
                      : "false"
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

          <section
            className="resource-edit-section"
            aria-labelledby="resource-edit-capacity-title"
          >
            <div className="resource-edit-section__header">
              <h2 id="resource-edit-capacity-title">
                Capacidad
              </h2>

              <p>
                Límites de ocupación configurados para el
                recurso.
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
                  {...register(
                    "capacityMaximumChildren",
                  )}
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

          {submitError && (
            <div
              className="resource-edit-error resource-edit-error--submit"
              role="alert"
            >
              {submitError}
            </div>
          )}

          <footer className="resource-edit-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={returnToResource}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting}
            >
              <Save size={20} aria-hidden="true" />

              {isSubmitting
                ? "Guardando…"
                : "Guardar cambios"}
            </Button>
          </footer>
        </div>
      </form>
    </section>
  );
}
