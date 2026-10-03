import { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredPopover, getAnchoredPosition } from "./AnchoredPopover";

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) });
let anchorRect = rect(100, 40, 140, 44);
let panelHeight = 280;

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  private readonly notifyCallback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(notifyCallback: ResizeObserverCallback) { this.notifyCallback = notifyCallback; ResizeObserverMock.instances.push(this); }
  notify() { this.notifyCallback([], this as unknown as ResizeObserver); }
}

function Example({ search = false, withControls = true, onClose = () => {}, onAnchorHidden, preventEscape = false, anchoredLabel = false, alternateTrigger = false }: { search?: boolean; withControls?: boolean; onClose?: () => void; onAnchorHidden?: () => void; preventEscape?: boolean; anchoredLabel?: boolean; alternateTrigger?: boolean }) {
  const trigger = useRef<HTMLElement>(null);
  const labelAnchor = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  return <div data-testid="wrapper" style={{ overflow: "hidden" }}>
    <button>Antes</button>
    {search
      ? <label ref={labelAnchor} data-anchor={anchoredLabel ? "label" : undefined}><span>Buscar</span><input ref={(element) => { trigger.current = element; }} data-anchor={anchoredLabel ? undefined : "true"} aria-label="Buscar" onFocus={() => setOpen(true)} onKeyDown={(event) => { if (preventEscape && event.key === "Escape") event.preventDefault(); }} /></label>
      : <button key={alternateTrigger ? "new" : "original"} ref={(element) => { trigger.current = element; }} data-anchor={alternateTrigger ? "new" : "true"} onClick={() => setOpen(true)}>Abrir</button>}
    <button hidden>Oculto</button><button style={{ display: "none" }}>Sin mostrar</button>{withControls && <div inert><button>Inerte</button></div>}<button tabIndex={-1}>Fuera de Tab</button>
    <button>Después</button>
    <AnchoredPopover open={open} label="Ayuda" triggerRef={trigger} anchorRef={anchoredLabel ? labelAnchor : undefined} onClose={() => { onClose(); setOpen(false); }} onAnchorHidden={onAnchorHidden} focusOnOpen={!search} role={search ? "region" : "dialog"} id="test-popover" describedBy="test-description">
      <p id="test-description">Opciones del encabezado</p>
      {withControls && <><button>Primero</button><button disabled>Deshabilitado</button><button hidden>Oculto en panel</button><button>Último</button></>}
    </AnchoredPopover>
  </div>;
}

beforeEach(() => {
  anchorRect = rect(100, 40, 140, 44);
  panelHeight = 280;
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("visualViewport", undefined);
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.anchor === "label") return rect(anchorRect.left - 26, anchorRect.top, anchorRect.width + 26, anchorRect.height);
    if (this.dataset.anchor === "new") return rect(480, 100, 140, 44);
    if (this.dataset.anchor) return anchorRect;
    if (this.classList.contains("top-anchored-popover")) return rect(0, 0, parseFloat(this.style.width) || 360, Math.min(panelHeight, parseFloat(this.style.maxHeight) || panelHeight));
    return rect(0, 0, 44, 44);
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("top-anchored-popover") ? panelHeight : 44; });
});

afterEach(() => { cleanup(); document.documentElement.style.removeProperty("zoom"); document.body.style.removeProperty("zoom"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("getAnchoredPosition", () => {
  const viewport = { left: 0, top: 0, width: 1024, height: 768 };
  it("opens below the actual anchor with a gap and supports end alignment", () => {
    expect(getAnchoredPosition(rect(420, 40, 200, 44), 280, viewport)).toEqual({ left: 420, top: 92, width: 360, maxHeight: 660 });
    expect(getAnchoredPosition(rect(420, 40, 200, 44), 280, viewport, 360, "end").left).toBe(260);
  });
  it("fits both horizontal edges and narrows the panel on mobile", () => {
    expect(getAnchoredPosition(rect(990, 40, 24, 44), 280, viewport).left).toBe(648);
    expect(getAnchoredPosition(rect(0, 40, 24, 44), 280, viewport, 360, "end").left).toBe(16);
    expect(getAnchoredPosition(rect(300, 40, 44, 44), 280, { ...viewport, width: 320 })).toMatchObject({ left: 16, width: 288 });
  });
  it("flips above when the content does not fit and more space is available", () => {
    expect(getAnchoredPosition(rect(100, 660, 140, 44), 280, viewport)).toMatchObject({ top: 372, maxHeight: 636 });
  });
  it("limits tall content to the larger side without crossing viewport edges", () => {
    expect(getAnchoredPosition(rect(100, 350, 140, 44), 900, viewport)).toMatchObject({ top: 402, maxHeight: 350 });
    expect(getAnchoredPosition(rect(100, 500, 140, 44), 900, viewport)).toMatchObject({ top: 16, maxHeight: 476 });
  });
  it("uses the visible viewport offsets during zoom and pans", () => {
    expect(getAnchoredPosition(rect(580, 170, 80, 44), 100, { left: 300, top: 100, width: 400, height: 300 })).toEqual({ left: 324, top: 222, width: 360, maxHeight: 162 });
  });
});

describe("AnchoredPopover", () => {
  it("portals a non-modal panel outside clipping ancestors and focuses the dialog", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog", { name: "Ayuda" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveFocus();
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog).toHaveAttribute("aria-describedby", "test-description");
    expect(dialog).toHaveStyle({ position: "fixed", top: "92px", left: "100px", width: "360px", maxHeight: "660px", overflow: "auto" });
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("wrapper")).not.toHaveAttribute("inert");
  });

  it("bridges Tab from the dialog through its controls to the next visible document control", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<Example onClose={close} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Último" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps search focused and bridges its retry controls in both directions without a focus trap", async () => {
    const user = userEvent.setup();
    render(<Example search />);
    const input = screen.getByRole("textbox", { name: "Buscar" });
    await user.click(input);
    expect(input).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();
    expect(screen.getByRole("region", { name: "Ayuda" })).toBeInTheDocument();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Antes" })).toHaveFocus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("lets Tab leave search normally when results have no tabbable controls", async () => {
    const user = userEvent.setup();
    render(<Example search withControls={false} />);
    await user.click(screen.getByRole("textbox", { name: "Buscar" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores trigger focus without scrolling", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    const focus = vi.spyOn(trigger, "focus");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("respects Escape already handled by the search owner", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<Example search preventEscape onClose={close} />);
    await user.click(screen.getByRole("textbox", { name: "Buscar" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes outside without stealing the clicked control's focus", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<Example onClose={close} />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    const focus = vi.spyOn(trigger, "focus");
    await user.click(screen.getByRole("button", { name: "Después" }));
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps pointer and focus activity inside the panel open and closes external focus without restoring it", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(screen.getByRole("button", { name: "Primero" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Primero" })).toHaveFocus();
    act(() => screen.getByRole("button", { name: "Después" }).focus());
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("repositions on captured nested scroll, window resize and ResizeObserver content changes", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Primero" }));
    expect(ResizeObserverMock.instances[0].observe).toHaveBeenCalledWith(dialog);
    expect(ResizeObserverMock.instances[0].observe).toHaveBeenCalledWith(screen.getByRole("button", { name: "Abrir" }));
    anchorRect = rect(600, 80, 140, 44);
    fireEvent.scroll(screen.getByTestId("wrapper"));
    expect(dialog).toHaveStyle({ left: "600px", top: "132px" });
    vi.stubGlobal("innerWidth", 390);
    fireEvent.resize(window);
    expect(dialog).toHaveStyle({ left: "16px", width: "358px" });
    anchorRect = rect(200, 600, 140, 44);
    panelHeight = 500;
    dialog.style.border = "1px solid black";
    act(() => ResizeObserverMock.instances[0].notify());
    expect(dialog).toHaveStyle({ top: "90px", maxHeight: "576px" });
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("can anchor to the full search field while keeping keyboard focus on its input", async () => {
    const user = userEvent.setup();
    render(<Example search anchoredLabel />);
    const input = screen.getByRole("textbox", { name: "Buscar" });
    await user.click(input);
    const region = screen.getByRole("region");
    expect(region).toHaveStyle({ left: "74px", top: "92px" });
    expect(input).toHaveFocus();
    fireEvent.pointerDown(input.parentElement!);
    expect(region).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("remeasures and observes a replaced trigger without requiring a different RefObject", async () => {
    const user = userEvent.setup();
    const view = render(<Example />);
    const original = screen.getByRole("button", { name: "Abrir" });
    await user.click(original);
    const observer = ResizeObserverMock.instances[0];
    view.rerender(<Example alternateTrigger />);
    const replacement = screen.getByRole("button", { name: "Abrir" });
    expect(screen.getByRole("dialog")).toHaveStyle({ left: "480px", top: "152px" });
    expect(observer.unobserve).toHaveBeenCalledWith(original);
    expect(observer.observe).toHaveBeenCalledWith(replacement);
    await user.keyboard("{Escape}");
    expect(replacement).toHaveFocus();
  });

  it("repositions with visualViewport resize and scroll during zoom or virtual keyboard changes", async () => {
    const visual = Object.assign(new EventTarget(), { offsetLeft: 100, offsetTop: 20, width: 600, height: 700 });
    vi.stubGlobal("visualViewport", visual);
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ left: "116px" });
    visual.width = 300;
    act(() => visual.dispatchEvent(new Event("resize")));
    expect(dialog).toHaveStyle({ left: "116px", width: "268px" });
    visual.offsetTop = 100;
    act(() => visual.dispatchEvent(new Event("scroll")));
    expect(dialog).toHaveStyle({ top: "116px" });
  });

  it("converts measured viewport coordinates to the portal's CSS zoom scale exactly once", async () => {
    document.documentElement.style.setProperty("zoom", "2");
    anchorRect = rect(200, 80, 280, 88);
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ left: "100px", top: "88px", width: "360px", maxHeight: "288px" });
    // Factores de zoom de ancestros distintos se combinan, sin resetear estilos.
    document.body.style.setProperty("zoom", "50%");
    anchorRect = rect(100, 40, 140, 44);
    fireEvent.resize(window);
    expect(dialog).toHaveStyle({ left: "100px", top: "92px", width: "360px", maxHeight: "660px" });
    expect(document.documentElement.style.getPropertyValue("zoom")).toBe("2");
    expect(document.body.style.getPropertyValue("zoom")).toBe("50%");
  });

  it("closes when its anchor disappears at a breakpoint without focusing hidden controls", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<Example onClose={close} />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    const focus = vi.spyOn(trigger, "focus");
    trigger.style.display = "none";
    fireEvent.resize(window);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(close).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it("delegates fallback focus only when a disappearing anchor affects current panel or trigger focus", async () => {
    const user = userEvent.setup();
    const fallback = vi.fn(() => screen.getByRole("button", { name: "Después" }).focus());
    const close = vi.fn();
    render(<Example onAnchorHidden={fallback} onClose={close} />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    trigger.style.display = "none";
    fireEvent.resize(window);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    trigger.style.display = "";
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Después" }));
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("removes observers and event subscriptions on unmount without restoring focus", async () => {
    const visual = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 1024, height: 768 });
    vi.stubGlobal("visualViewport", visual);
    const removeVisual = vi.spyOn(visual, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const user = userEvent.setup();
    const view = render(<Example />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    const focus = vi.spyOn(trigger, "focus");
    view.unmount();
    expect(ResizeObserverMock.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(removeWindow).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeVisual).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeVisual).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(focus).not.toHaveBeenCalled();
  });
});
