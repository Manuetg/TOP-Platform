import { useLayoutEffect, useRef, useState, type CSSProperties, type PropsWithChildren, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./AnchoredPopover.css";

interface AnchoredPopoverProps extends PropsWithChildren {
  open: boolean;
  label: string;
  className?: string;
  triggerRef: RefObject<HTMLElement | null>;
  anchorRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onAnchorHidden?: () => void;
  align?: "start" | "end";
  width?: number;
  role?: "dialog" | "region";
  focusOnOpen?: boolean;
  describedBy?: string;
  id?: string;
}

interface Viewport { left: number; top: number; width: number; height: number }
interface Position { left: number; top: number; width: number; maxHeight: number }
const margin = 16;
const gap = 8;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Coordenadas CSS del viewport visible, incluido zoom y teclado en pantalla. */
function visibleViewport(): Viewport {
  const visual = window.visualViewport;
  return visual
    ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
    : { left: 0, top: 0, width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
}

export function getAnchoredPosition(anchor: Pick<DOMRect, "left" | "right" | "top" | "bottom">, panelHeight: number, viewport: Viewport, preferredWidth = 360, align: "start" | "end" = "start"): Position {
  const insetX = Math.min(margin, viewport.width / 2);
  const insetY = Math.min(margin, viewport.height / 2);
  const leftEdge = viewport.left + insetX;
  const rightEdge = viewport.left + viewport.width - insetX;
  const topEdge = viewport.top + insetY;
  const bottomEdge = viewport.top + viewport.height - insetY;
  const width = clamp(preferredWidth, 0, rightEdge - leftEdge);
  const belowTop = clamp(anchor.bottom + gap, topEdge, bottomEdge);
  const aboveBottom = clamp(anchor.top - gap, topEdge, bottomEdge);
  const below = bottomEdge - belowTop;
  const above = aboveBottom - topEdge;
  const flip = panelHeight > below && above > below;
  const maxHeight = flip ? above : below;
  return {
    left: clamp(align === "end" ? anchor.right - width : anchor.left, leftEdge, rightEdge - width),
    top: flip ? aboveBottom - Math.min(panelHeight, maxHeight) : belowTop,
    width,
    maxHeight,
  };
}

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

function effectiveZoom(element: HTMLElement): number {
  let zoom = 1;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const value = getComputedStyle(current).getPropertyValue("zoom");
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) zoom *= value.endsWith("%") ? parsed / 100 : parsed;
  }
  return zoom;
}

function tabbableControls(root: Document | HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]')]
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled, input[type="hidden"]') && isVisible(element));
}

/** Panel no modal: conserva scroll y acceso al resto de la pantalla. */
export function AnchoredPopover({ open, label, className = "", triggerRef, anchorRef, onClose, onAnchorHidden, align = "start", width = 360, role = "dialog", focusOnOpen = true, describedBy, id, children }: AnchoredPopoverProps) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const hiddenAnchor = useRef(onAnchorHidden);
  hiddenAnchor.current = onAnchorHidden;
  const dismissed = useRef(false);
  const initiallyFocused = useRef(false);
  const updateLayout = useRef<(() => void) | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const element = panel.current;
    let anchor = anchorRef ? anchorRef.current : triggerRef.current;
    let observer: ResizeObserver | undefined;
    dismissed.current = false;
    const dismiss = (restoreFocus = false) => {
      if (dismissed.current) return;
      dismissed.current = true;
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
      close.current();
    };
    const dismissHiddenAnchor = () => {
      if (!dismissed.current && (element.contains(document.activeElement) || triggerRef.current?.contains(document.activeElement))) hiddenAnchor.current?.();
      dismiss();
    };
    const update = () => {
      const currentAnchor = anchorRef ? anchorRef.current : triggerRef.current;
      if (currentAnchor !== anchor) {
        if (anchor) observer?.unobserve(anchor);
        anchor = currentAnchor;
        if (anchor) observer?.observe(anchor);
      }
      if (!anchor?.isConnected || !isVisible(anchor)) { dismissHiddenAnchor(); return; }
      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height) { dismissHiddenAnchor(); return; }
      const style = getComputedStyle(element);
      const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      // DOMRect ya refleja CSS zoom; las coordenadas inline del portal son locales.
      const zoom = effectiveZoom(element);
      const height = Math.max((element.scrollHeight + border) * zoom, element.getBoundingClientRect().height);
      const viewportPosition = getAnchoredPosition(rect, height, visibleViewport(), width * zoom, align);
      const next: Position = {
        left: viewportPosition.left / zoom,
        top: viewportPosition.top / zoom,
        width: viewportPosition.width / zoom,
        maxHeight: viewportPosition.maxHeight / zoom,
      };
      setPosition((current) => current && Object.keys(next).every((key) => current[key as keyof Position] === next[key as keyof Position]) ? current : next);
    };
    const contains = (target: EventTarget | null) => target instanceof Node && (element.contains(target) || anchor?.contains(target) || triggerRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => { if (!contains(event.target)) dismiss(); };
    const onFocusIn = (event: FocusEvent) => { if (!contains(event.target)) dismiss(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || element.closest("[inert]") || !contains(event.target)) return;
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        dismiss(true);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = tabbableControls(element);
      const first = controls[0];
      const last = controls.at(-1);
      const active = document.activeElement;
      const trigger = triggerRef.current;
      if (!event.shiftKey && (active === trigger || active === element) && first) {
        event.preventDefault(); first.focus({ preventScroll: true });
      } else if (event.shiftKey && (active === first || active === element)) {
        event.preventDefault(); trigger?.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        const documentControls = tabbableControls(document).filter((control) => !element.contains(control));
        const anchorIndex = trigger ? documentControls.indexOf(trigger) : -1;
        const next = anchorIndex >= 0 ? documentControls[anchorIndex + 1] : undefined;
        if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
        else { dismiss(); }
      }
    };
    updateLayout.current = update;
    update();
    observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    if (anchor) observer?.observe(anchor);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const visual = window.visualViewport;
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      updateLayout.current = null;
      observer?.disconnect();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
    };
  }, [open, triggerRef, anchorRef, align, width]);

  // Las refs pueden apuntar a otro disparador sin cambiar el objeto RefObject.
  useLayoutEffect(() => { updateLayout.current?.(); });

  useLayoutEffect(() => {
    if (!open) { initiallyFocused.current = false; return; }
    if (position && focusOnOpen && !dismissed.current && !initiallyFocused.current) {
      initiallyFocused.current = true;
      panel.current?.focus({ preventScroll: true });
    }
  }, [open, focusOnOpen, position]);

  if (!open) return null;
  const style: CSSProperties = { position: "fixed", ...position, visibility: position ? undefined : "hidden", overflow: "auto", boxSizing: "border-box" };
  return createPortal(
    <section ref={panel} id={id} className={`top-anchored-popover ${className}`.trim()} role={role} aria-label={label} aria-describedby={describedBy} tabIndex={role === "dialog" ? -1 : undefined} style={style}>
      {children}
    </section>,
    document.body,
  );
}
