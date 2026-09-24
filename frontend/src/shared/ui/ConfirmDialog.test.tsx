import { useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function Example({ loading = false, disabled = false, confirm = vi.fn() }) {
  const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} onClick={() => setOpen(true)}>Abrir</button><ConfirmDialog open={open} title="Archivar contacto" description="Conserva el historial." confirmLabel="Archivar" triggerRef={trigger} destructive loading={loading} disabled={disabled} onCancel={() => setOpen(false)} onConfirm={confirm} /></>;
}
describe("ConfirmDialog", () => {
  it("monta la confirmación fuera de la página, aísla el fondo y cierra desde el backdrop", async () => {
    const user = userEvent.setup(); const view = render(<Example />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(document.body).toContainElement(dialog);
    expect(view.container).not.toContainElement(dialog);
    expect(view.container).toHaveAttribute("inert");
    trigger.focus(); expect(dialog).toHaveFocus();
    const backdrop = screen.getByRole("button", { name: "Cerrar Archivar contacto" });
    expect(backdrop).toHaveAttribute("tabindex", "-1");
    await user.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.container).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("restaura la interacción del fondo al desmontar una confirmación abierta", async () => {
    const user = userEvent.setup(); const view = render(<Example />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(view.container).toHaveAttribute("inert");
    view.unmount();
    expect(view.container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });
  it("expone descripción, atrapa Tab, cancela con Escape y devuelve foco", async () => {
    const user = userEvent.setup(); render(<Example />);
    const trigger = screen.getByRole("button", { name: "Abrir" }); await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Archivar contacto" });
    expect(dialog).toHaveAttribute("aria-modal", "true"); expect(dialog).toHaveAccessibleDescription("Conserva el historial."); expect(dialog).toHaveFocus();
    await user.tab(); expect(screen.getByRole("button", { name: "Cancelar", hidden: false })).toHaveFocus();
    await user.tab({ shift: true }); expect(screen.getByRole("button", { name: "Archivar" })).toHaveFocus();
    await user.tab(); expect(screen.getByRole("button", { name: "Cancelar", hidden: false })).toHaveFocus();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it("impide confirmar/cerrar mientras procesa y mantiene el foco dentro", async () => {
    const user = userEvent.setup(); const confirm = vi.fn(); render(<Example loading confirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("button", { name: "Procesando…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cerrar Archivar contacto" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeVisible(); await user.tab(); expect(screen.getByRole("dialog")).toHaveFocus(); expect(confirm).not.toHaveBeenCalled();
  });
  it("respeta disabled y confirma por teclado", async () => {
    const user = userEvent.setup(); const confirm = vi.fn(); const view = render(<Example disabled confirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Abrir" })); expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    view.rerender(<Example confirm={confirm} />); screen.getByRole("button", { name: "Archivar" }).focus(); await user.keyboard("{Enter}"); expect(confirm).toHaveBeenCalledTimes(1);
  });
});
