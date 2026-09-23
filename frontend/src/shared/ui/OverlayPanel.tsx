import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";

interface OverlayPanelProps extends PropsWithChildren {
  open: boolean;
  label: string;
  className: string;
  layerClassName: string;
  closeLabel: string;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/** Dialog behavior is shared; hidden content cannot remain in the tab sequence. */
export function OverlayPanel({ open, label, className, layerClassName, closeLabel, triggerRef, onClose, children }: OverlayPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const [hasOpened, setHasOpened] = useState(open);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open || !panel.current) return;
    setHasOpened(true);
    const element = panel.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.focus();
    const dismiss = () => {
      triggerRef.current?.focus();
      close.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, triggerRef]);

  const dismiss = () => { triggerRef.current?.focus(); onClose(); };
  if (!open && !hasOpened) return null;
  return (
    <div className={`top-overlay ${layerClassName}`} hidden={!open} inert={!open}>
      <button type="button" className="top-overlay__backdrop" tabIndex={-1} aria-label={closeLabel} onClick={dismiss} />
      <section ref={panel} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </section>
    </div>
  );
}
