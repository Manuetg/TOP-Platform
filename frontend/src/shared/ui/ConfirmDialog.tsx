import { useId, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import { OverlayPanel } from "./OverlayPanel";
import "./ConfirmDialog.css";

interface Props {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmVariant?: "primary" | "warning" | "destructive";
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  triggerRef: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Cancelar", destructive = false, confirmVariant, loading = false, disabled = false, error, triggerRef, onConfirm, onCancel }: Props) {
  const descriptionId = useId();
  return <OverlayPanel open={open} portal label={title} describedBy={descriptionId} className="top-confirm" layerClassName="top-confirm-layer" closeLabel={`Cerrar ${title}`} triggerRef={triggerRef} onClose={onCancel} dismissible={!loading}>
    <h2>{title}</h2>
    <div id={descriptionId}>{description}</div>
    {error && <p role="alert" className="top-field__error">{error}</p>}
    <div className="top-confirm__actions">
      <Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>{cancelLabel}</Button>
      <Button type="button" variant={confirmVariant ?? (destructive ? "destructive" : "primary")} loading={loading} loadingLabel="Procesando…" disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </OverlayPanel>;
}
