import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("warning conserva activación por teclado y bloquea disabled/loading", async () => {
    const user = userEvent.setup(); const onClick = vi.fn();
    const view = render(<Button variant="warning" onClick={onClick}>Archivar</Button>);
    const button = screen.getByRole("button", { name: "Archivar" });
    expect(button).toHaveClass("top-button--warning");
    button.focus(); await user.keyboard("{Enter}"); expect(onClick).toHaveBeenCalledOnce();
    view.rerender(<Button variant="warning" disabled onClick={onClick}>Archivar</Button>);
    await user.click(button); expect(onClick).toHaveBeenCalledOnce();
    view.rerender(<Button variant="warning" loading onClick={onClick}>Archivar</Button>);
    expect(button).toHaveAttribute("aria-busy", "true"); expect(button).toBeDisabled();
    await user.click(button); expect(onClick).toHaveBeenCalledOnce();
  });
  it("renders its label", () => {
    render(<Button>Guardar cambios</Button>);
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Guardar</Button>);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not activate when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("announces pending state, blocks repeated activation and becomes available again", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const view = render(<Button loading loadingLabel="Guardando..." onClick={onClick}>Guardar</Button>);
    const button = screen.getByRole("button", { name: "Guardando..." });
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    view.rerender(<Button onClick={onClick}>Guardar</Button>);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps an accessible name for an icon-only control", () => {
    render(<Button iconOnly aria-label="Cerrar" variant="tertiary" size="sm"><svg aria-hidden="true" /></Button>);
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled();
  });
});
