import {
  Ban,
  CalendarDays,
  ChevronDown,
  CircleX,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useResources } from "../../resources/queries/use-resources";
import { useBlocks } from "../queries/use-blocks";
import { useCancelBlock } from "../queries/use-cancel-block";
import type {
  Block,
  BlockType,
  EffectiveBlockStatus,
} from "../types/block.types";
import "./BlockListPage.css";

interface BlockListPageProps {
  businessId?: string;
}


const ALL = "ALL";

type StatusFilter = EffectiveBlockStatus | typeof ALL;
type TypeFilter = BlockType | typeof ALL;

function getStatusLabel(status: EffectiveBlockStatus) {
  switch (status) {
    case "SCHEDULED":
      return "Programado";
    case "ACTIVE":
      return "Activo";
    case "FINISHED":
      return "Finalizado";
    case "CANCELLED":
      return "Cancelado";
  }
}

function getTypeLabel(type: BlockType) {
  switch (type) {
    case "MAINTENANCE":
      return "Mantenimiento";
    case "OWNER_USE":
      return "Uso del propietario";
    case "OTHER":
      return "Otro";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toStartOfDayIso(date: string) {
  if (!date) {
    return undefined;
  }

  const [year, month, day] = date
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0,
  ).toISOString();
}

function toEndOfDayIso(date: string) {
  if (!date) {
    return undefined;
  }

  const [year, month, day] = date
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    23,
    59,
    59,
    999,
  ).toISOString();
}

function canCancelBlock(status: EffectiveBlockStatus) {
  return (
    status === "SCHEDULED" ||
    status === "ACTIVE"
  );
}

function BlockStatusBadge({
  status,
}: {
  status: EffectiveBlockStatus;
}) {
  return (
    <span
      className={`block-list-status block-list-status--${status.toLowerCase()}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function BlockTableRow({
  block,
  resourceName,
  onCancel,
}: {
  block: Block;
  resourceName: string;
  onCancel: (block: Block) => void;
}) {
  return (
    <div className="block-list-row">
      <div className="block-list-row__resource">
        <strong>{resourceName}</strong>
      </div>

      <span>{getTypeLabel(block.type)}</span>

      <div className="block-list-row__reason">
        <strong>{block.reason}</strong>
        {block.notes && <span>{block.notes}</span>}
      </div>

      <span>{formatDateTime(block.startsAt)}</span>

      <span>{formatDateTime(block.endsAt)}</span>

      <BlockStatusBadge status={block.effectiveStatus} />

      <div className="block-list-row__actions">
        {canCancelBlock(block.effectiveStatus) && (
          <button
            type="button"
            className="block-list-cancel-button"
            onClick={() => onCancel(block)}
            aria-label={`Cancelar bloqueo de ${resourceName}`}
            title="Cancelar bloqueo"
          >
            <CircleX
              size={18}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  resourceName,
  onCancel,
}: {
  block: Block;
  resourceName: string;
  onCancel: (block: Block) => void;
}) {
  return (
    <article className="block-list-card">
      <div className="block-list-card__header">
        <div>
          <span className="block-list-card__eyebrow">
            {getTypeLabel(block.type)}
          </span>
          <h2>{resourceName}</h2>
        </div>

        <BlockStatusBadge status={block.effectiveStatus} />
      </div>

      <div className="block-list-card__reason">
        <strong>{block.reason}</strong>
        {block.notes && <p>{block.notes}</p>}
      </div>

      <dl className="block-list-card__dates">
        <div>
          <dt>Desde</dt>
          <dd>{formatDateTime(block.startsAt)}</dd>
        </div>

        <div>
          <dt>Hasta</dt>
          <dd>{formatDateTime(block.endsAt)}</dd>
        </div>
      </dl>

      {canCancelBlock(block.effectiveStatus) && (
        <button
          type="button"
          className="block-list-card__cancel"
          onClick={() => onCancel(block)}
        >
          <CircleX
            size={18}
            aria-hidden="true"
          />
          Cancelar bloqueo
        </button>
      )}
    </article>
  );
}

export function BlockListPage({
  businessId: suppliedBusinessId,
}: BlockListPageProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const businessId = suppliedBusinessId ?? activeBusinessId;

  const [resourceId, setResourceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] =
    useState<StatusFilter>(ALL);
  const [type, setType] =
    useState<TypeFilter>(ALL);
  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [blockToCancel, setBlockToCancel] =
    useState<Block | null>(null);
  const [cancelReason, setCancelReason] =
    useState("");
  const [cancelValidationError, setCancelValidationError] =
    useState<string | null>(null);

  const hasInvalidDateRange =
    from.length > 0 &&
    to.length > 0 &&
    to <= from;

  const {
    data: blocks,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useBlocks({
    businessId,
    resourceId: resourceId || undefined,
    from: hasInvalidDateRange
      ? undefined
      : toStartOfDayIso(from),
    to: hasInvalidDateRange
      ? undefined
      : toEndOfDayIso(to),
    accessToken: session?.accessToken,
    enabled: !hasInvalidDateRange,
  });

  const cancelMutation = useCancelBlock({
    businessId,
    accessToken: session?.accessToken,
  });

  const {
    data: resources,
    isLoading: resourcesLoading,
  } = useResources({
    businessId,
    accessToken: session?.accessToken,
  });

  const resourceById = useMemo(
    () =>
      new Map(
        (resources ?? []).map((resource) => [
          resource.id,
          resource.name,
        ]),
      ),
    [resources],
  );

  const filteredBlocks = useMemo(() => {
    const current = blocks ?? [];

    return current.filter((block) => {
      const matchesStatus =
        status === ALL ||
        block.effectiveStatus === status;

      const matchesType =
        type === ALL ||
        block.type === type;

      return matchesStatus && matchesType;
    });
  }, [blocks, status, type]);

  const hasFilters =
    resourceId.length > 0 ||
    from.length > 0 ||
    to.length > 0 ||
    status !== ALL ||
    type !== ALL;

  function clearFilters() {
    setResourceId("");
    setFrom("");
    setTo("");
    setStatus(ALL);
    setType(ALL);
  }

  function openCancelDialog(block: Block) {
    setBlockToCancel(block);
    setCancelReason("");
    setCancelValidationError(null);
    cancelMutation.reset();
  }

  function closeCancelDialog() {
    if (cancelMutation.isPending) {
      return;
    }

    setBlockToCancel(null);
    setCancelReason("");
    setCancelValidationError(null);
    cancelMutation.reset();
  }

  async function confirmCancelBlock() {
    if (!blockToCancel) {
      return;
    }

    const normalizedReason =
      cancelReason.trim();

    if (
      normalizedReason.length < 2 ||
      normalizedReason.length > 500
    ) {
      setCancelValidationError(
        "El motivo de cancelación debe tener entre 2 y 500 caracteres.",
      );
      return;
    }

    setCancelValidationError(null);

    try {
      await cancelMutation.mutateAsync({
        blockId: blockToCancel.id,
        reason: normalizedReason,
      });

      setBlockToCancel(null);
      setCancelReason("");
    } catch {
      // El error queda disponible en cancelMutation.error.
    }
  }

  if (isLoading || resourcesLoading) {
    return (
      <section
        className="block-list-page"
        aria-busy="true"
      >
        <div className="block-list-state">
          <div
            className="block-list-state__icon"
            aria-hidden="true"
          >
            <Ban size={28} />
          </div>

          <h1>Cargando bloqueos</h1>
          <p>
            Estamos preparando el historial de
            bloqueos del Business.
          </p>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="block-list-page">
        <div
          className="block-list-state"
          role="alert"
        >
          <div
            className="block-list-state__icon"
            aria-hidden="true"
          >
            <Ban size={28} />
          </div>

          <h1>No pudimos cargar los bloqueos</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "Ocurrió un error inesperado."}
          </p>

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
    <section className="block-list-page">
      <header className="block-list-header">
        <div>
          <h1>Bloqueos</h1>
          <p>
            Gestioná períodos en los que un recurso
            no puede recibir reservas.
          </p>
        </div>

        <Button
          type="button"
          className="block-list-header__create"
          onClick={() => navigate("/app/blocks/new")}
        >
          <Plus size={18} aria-hidden="true" />
          Nuevo bloqueo
        </Button>
      </header>

      <button
        type="button"
        className="block-list-filters-toggle"
        aria-expanded={filtersOpen}
        aria-controls="block-list-filters"
        onClick={() =>
          setFiltersOpen((current) => !current)
        }
      >
        <span>
          <SlidersHorizontal
            size={18}
            aria-hidden="true"
          />
          Filtros
        </span>

        {hasFilters && (
          <span className="block-list-filters-toggle__active">
            Activos
          </span>
        )}

        <ChevronDown
          size={18}
          aria-hidden="true"
          className={
            filtersOpen
              ? "block-list-filters-toggle__chevron block-list-filters-toggle__chevron--open"
              : "block-list-filters-toggle__chevron"
          }
        />
      </button>

      <div
        id="block-list-filters"
        className={
          filtersOpen
            ? "block-list-filters block-list-filters--open"
            : "block-list-filters"
        }
        aria-label="Filtros de bloqueos"
      >
        <div className="block-list-field">
          <label htmlFor="block-resource">
            Recurso
          </label>

          <select
            id="block-resource"
            value={resourceId}
            onChange={(event) =>
              setResourceId(event.target.value)
            }
          >
            <option value="">
              Todos los recursos
            </option>

            {(resources ?? []).map((resource) => (
              <option
                key={resource.id}
                value={resource.id}
              >
                {resource.name}
              </option>
            ))}
          </select>
        </div>

        <div className="block-list-field">
          <label htmlFor="block-from">
            Desde
          </label>

          <input
            id="block-from"
            type="date"
            value={from}
            onChange={(event) =>
              setFrom(event.target.value)
            }
          />
        </div>

        <div className="block-list-field">
          <label htmlFor="block-to">
            Hasta
          </label>

          <input
            id="block-to"
            type="date"
            value={to}
            onChange={(event) =>
              setTo(event.target.value)
            }
          />
        </div>

        <div className="block-list-field">
          <label htmlFor="block-status">
            Estado
          </label>

          <select
            id="block-status"
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as StatusFilter,
              )
            }
          >
            <option value={ALL}>
              Todos los estados
            </option>
            <option value="SCHEDULED">
              Programado
            </option>
            <option value="ACTIVE">
              Activo
            </option>
            <option value="FINISHED">
              Finalizado
            </option>
            <option value="CANCELLED">
              Cancelado
            </option>
          </select>
        </div>

        <div className="block-list-field">
          <label htmlFor="block-type">
            Tipo
          </label>

          <select
            id="block-type"
            value={type}
            onChange={(event) =>
              setType(
                event.target.value as TypeFilter,
              )
            }
          >
            <option value={ALL}>
              Todos los tipos
            </option>
            <option value="MAINTENANCE">
              Mantenimiento
            </option>
            <option value="OWNER_USE">
              Uso del propietario
            </option>
            <option value="OTHER">
              Otro
            </option>
          </select>
        </div>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            className="block-list-filters__clear"
            onClick={clearFilters}
          >
            <RotateCcw
              size={17}
              aria-hidden="true"
            />
            Limpiar
          </Button>
        )}
      </div>

      {hasInvalidDateRange && (
        <p
          className="block-list-filter-error"
          role="alert"
        >
          La fecha “Hasta” debe ser posterior a la fecha “Desde”.
        </p>
      )}

      <div className="block-list-summary">
        <span>
          {filteredBlocks.length}{" "}
          {filteredBlocks.length === 1
            ? "bloqueo"
            : "bloqueos"}
        </span>

        {isFetching && !isLoading && (
          <span
            className="block-list-summary__loading"
            role="status"
          >
            Actualizando…
          </span>
        )}
      </div>

      {filteredBlocks.length === 0 ? (
        <div
          className="block-list-state block-list-state--compact"
          role="status"
        >
          <div
            className="block-list-state__icon"
            aria-hidden="true"
          >
            <CalendarDays size={28} />
          </div>

          <h2>
            {hasFilters
              ? "No encontramos bloqueos"
              : "Todavía no hay bloqueos"}
          </h2>

          <p>
            {hasFilters
              ? "No hay bloqueos que coincidan con los filtros seleccionados."
              : "Los períodos bloqueados aparecerán acá cuando los agregues."}
          </p>

          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={clearFilters}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="block-list-table">
            <div
              className="block-list-table__header"
              aria-hidden="true"
            >
              <span>Recurso</span>
              <span>Tipo</span>
              <span>Motivo</span>
              <span>Desde</span>
              <span>Hasta</span>
              <span>Estado</span>
              <span aria-label="Acciones"></span>
            </div>

            <div className="block-list-table__body">
              {filteredBlocks.map((block) => (
                <BlockTableRow
                  key={block.id}
                  block={block}
                  onCancel={openCancelDialog}
                  resourceName={
                    resourceById.get(
                      block.resourceId,
                    ) ?? "Recurso"
                  }
                />
              ))}
            </div>
          </div>

          <div className="block-list-cards">
            {filteredBlocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                onCancel={openCancelDialog}
                resourceName={
                  resourceById.get(
                    block.resourceId,
                  ) ?? "Recurso"
                }
              />
            ))}
          </div>
        </>
      )}

      {blockToCancel && (
        <div
          className="block-cancel-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCancelDialog();
            }
          }}
        >
          <div
            className="block-cancel-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-cancel-dialog-title"
          >
            <div className="block-cancel-dialog__header">
              <div>
                <h2 id="block-cancel-dialog-title">
                  Cancelar bloqueo
                </h2>
                <p>
                  El bloqueo quedará registrado en el historial
                  como cancelado.
                </p>
              </div>

              <button
                type="button"
                className="block-cancel-dialog__close"
                onClick={closeCancelDialog}
                aria-label="Cerrar"
                disabled={cancelMutation.isPending}
              >
                <X
                  size={20}
                  aria-hidden="true"
                />
              </button>
            </div>

            <div className="block-cancel-dialog__summary">
              <strong>
                {resourceById.get(
                  blockToCancel.resourceId,
                ) ?? "Recurso"}
              </strong>

              <span>
                {formatDateTime(blockToCancel.startsAt)}
                {" — "}
                {formatDateTime(blockToCancel.endsAt)}
              </span>
            </div>

            <div className="block-cancel-dialog__field">
              <label htmlFor="block-cancel-reason">
                Motivo de cancelación
              </label>

              <textarea
                id="block-cancel-reason"
                rows={4}
                maxLength={500}
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                  setCancelValidationError(null);
                  cancelMutation.reset();
                }}
                placeholder="Ej. El mantenimiento fue reprogramado"
                autoFocus
              />

              <span>
                {cancelReason.length}/500
              </span>
            </div>

            {(cancelValidationError ||
              cancelMutation.isError) && (
              <div
                className="block-cancel-dialog__error"
                role="alert"
              >
                {cancelValidationError ??
                  (cancelMutation.error instanceof Error
                    ? cancelMutation.error.message
                    : "No pudimos cancelar el bloqueo.")}
              </div>
            )}

            <div className="block-cancel-dialog__actions">
              <Button
                type="button"
                variant="secondary"
                onClick={closeCancelDialog}
                disabled={cancelMutation.isPending}
              >
                Volver
              </Button>

              <Button
                type="button"
                variant="danger"
                onClick={() =>
                  void confirmCancelBlock()
                }
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending
                  ? "Cancelando..."
                  : "Cancelar bloqueo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
