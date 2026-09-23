import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "./OverlayPanel";

function Example() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <><button ref={trigger} onClick={() => setOpen(true)}>Abrir</button><button>Otra acción</button>
    <OverlayPanel open={open} triggerRef={trigger} onClose={() => setOpen(false)} label="Ayuda" closeLabel="Cerrar ayuda" className="top-surface" layerClassName="">
      <button>Primero</button><button>Último</button>
    </OverlayPanel></>;
}

describe("OverlayPanel", () => {
  it("moves focus inside, cycles Tab and returns it on Escape before exit", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Ayuda" });
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Último" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Primero" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dialog.parentElement).toHaveAttribute("inert");
    await user.tab();
    expect(screen.getByRole("button", { name: "Otra acción" })).toHaveFocus();
  });

  it("closes from outside, reopens without a stale exit and restores scrolling on unmount", async () => {
    const user = userEvent.setup();
    const view = render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("button", { name: "Cerrar ayuda" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("dialog")).toHaveFocus();
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
