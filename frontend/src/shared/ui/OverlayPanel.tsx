import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { createPortal } from "react-dom";

interface OverlayPanelProps extends PropsWithChildren {
  open: boolean;
  label: string;
  className: string;
  layerClassName: string;
  closeLabel: string;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  dismissible?: boolean;
  describedBy?: string;
  portal?: boolean;
}

/** Dialog behavior is shared; hidden content cannot remain in the tab sequence. */
export function OverlayPanel({ open, label, className, layerClassName, closeLabel, triggerRef, onClose, dismissible = true, describedBy, portal = false, children }: OverlayPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const [hasOpened, setHasOpened] = useState(open);
  const close = useRef(onClose);
  close.current = onClose;
  const canDismiss = useRef(dismissible);
  canDismiss.current = dismissible;

  useEffect(() => {
    if (!open || !panel.current) return;
    setHasOpened(true);
    const element = panel.current;
    // Las confirmaciones escapan del stacking context de la página y aíslan el fondo.
    const background = portal ? [...document.body.children]
      .filter((child) => child instanceof HTMLElement && child !== element.parentElement)
      .map((child) => ({ element: child, inert: child.hasAttribute("inert") })) : [];
    background.forEach(({ element: item }) => item.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.focus();
    const dismiss = () => {
      if (!canDismiss.current) return;
      triggerRef.current?.focus();
      close.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (element.closest("[inert]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
      if (event.key !== "Tab") return;
      const controls = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter((control) => !control.closest('[hidden], [inert]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (portal && !element.closest("[inert]") && event.target instanceof Node && !element.contains(event.target)) element.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    if (portal) document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      background.forEach(({ element: item, inert }) => { if (!inert) item.removeAttribute("inert"); });
      document.body.style.overflow = previousOverflow;
      if (element.contains(document.activeElement)) triggerRef.current?.focus();
    };
  }, [open, triggerRef, portal]);

  const dismiss = () => { if (!dismissible) return; triggerRef.current?.focus(); onClose(); };
  if (!open && !hasOpened) return null;
  const layer = (
    <div className={`top-overlay ${layerClassName}`} hidden={!open} inert={!open}>
      <button type="button" className="top-overlay__backdrop" tabIndex={-1} aria-label={closeLabel} disabled={!dismissible} onClick={dismiss} />
      <section ref={panel} className={className} role="dialog" aria-modal="true" aria-label={label} aria-describedby={describedBy} tabIndex={-1}>
        {children}
      </section>
    </div>
  );
  return portal ? createPortal(layer, document.body) : layer;
}
