import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
  motion?: "mobile-sheet" | "dialog";
}

/** Dialog behavior is shared; hidden content cannot remain in the tab sequence. */
export function OverlayPanel({ open, label, className, layerClassName, closeLabel, triggerRef, onClose, dismissible = true, describedBy, portal = false, motion: motionPreset, children }: OverlayPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const [hasOpened, setHasOpened] = useState(open);
  const prefersReducedMotion = useReducedMotion();
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
      // Un modal puede perder foco al ocultarse antes de que React ejecute el cleanup.
      // Los paneles del shell conservan su condición para respetar cambios de breakpoint.
      if (portal || element.contains(document.activeElement)) triggerRef.current?.focus();
    };
  }, [open, triggerRef, portal]);

  const dismiss = () => { if (!dismissible) return; triggerRef.current?.focus(); onClose(); };
  if (!open && !hasOpened) return null;
  const isMobileSheet = motionPreset === "mobile-sheet";
  const isDialog = motionPreset === "dialog";
  const isAnimated = isMobileSheet || isDialog;
  const sheetTransition = prefersReducedMotion ? { duration: 0 } : {
    type: "spring" as const,
    stiffness: 460,
    damping: 38,
    mass: 0.65,
  };
  const sheetExitTransition = prefersReducedMotion ? { duration: 0 } : {
    duration: 0.18,
    ease: [0.4, 0, 1, 1] as const,
  };
  const backdropTransition = { duration: prefersReducedMotion ? 0 : 0.14 };
  const sheet = isAnimated ? (
        <AnimatePresence onExitComplete={() => setHasOpened(false)}>
      {open && (
        <motion.section
          ref={panel}
          key="mobile-more-sheet"
          className={className}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          aria-describedby={describedBy}
          tabIndex={-1}
          initial={isMobileSheet
            ? { y: prefersReducedMotion ? 0 : "100%" }
            : { opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: prefersReducedMotion ? 0 : 4 }}
          animate={isMobileSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobileSheet
            ? { y: prefersReducedMotion ? 0 : "100%" }
            : { opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: prefersReducedMotion ? 0 : 4 }}
          transition={open
            ? isMobileSheet
              ? sheetTransition
              : prefersReducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 30, mass: 0.9 }
            : isMobileSheet
              ? sheetExitTransition
              : { duration: prefersReducedMotion ? 0 : 0.16, ease: [0.4, 0, 1, 1] as const }}
        >
          {children}
        </motion.section>
      )}
    </AnimatePresence>
  ) : (
    <section ref={panel} className={className} role="dialog" aria-modal="true" aria-label={label} aria-describedby={describedBy} tabIndex={-1}>
      {children}
    </section>
  );
  const backdrop = isAnimated ? (
    <motion.button
      type="button"
      className="top-overlay__backdrop"
      tabIndex={-1}
      aria-label={closeLabel}
      disabled={!dismissible}
      onClick={dismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={backdropTransition}
    />
  ) : (
    <button type="button" className="top-overlay__backdrop" tabIndex={-1} aria-label={closeLabel} disabled={!dismissible} onClick={dismiss} />
  );
  const layer = (
    <div className={`top-overlay ${layerClassName}`} hidden={isAnimated ? !open && !hasOpened : !open} inert={!open}>
      {backdrop}
      {sheet}
    </div>
  );
  return portal ? createPortal(layer, document.body) : layer;
}
