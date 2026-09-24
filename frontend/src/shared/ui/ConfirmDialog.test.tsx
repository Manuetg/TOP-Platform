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
    await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeVisible(); await user.tab(); expect(screen.getByRole("dialog")).toHaveFocus(); expect(confirm).not.toHaveBeenCalled();
  });
  it("respeta disabled y confirma por teclado", async () => {
    const user = userEvent.setup(); const confirm = vi.fn(); const view = render(<Example disabled confirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Abrir" })); expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    view.rerender(<Example confirm={confirm} />); screen.getByRole("button", { name: "Archivar" }).focus(); await user.keyboard("{Enter}"); expect(confirm).toHaveBeenCalledTimes(1);
  });
});
