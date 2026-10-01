import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SaasLaunchShowcasePage } from "./SaasLaunchShowcasePage";

describe("SaasLaunchShowcasePage", () => {
  beforeAll(() => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renderiza los seis bloques del showcase con headings accesibles", () => {
    render(<SaasLaunchShowcasePage />);

    expect(screen.getByRole("heading", { name: /La operación clara,la hospitalidad en marcha/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gestioná el sistema, no sólo las tareas." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "La operación se siente más simple." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Simple, predecible y alineado a tu operación." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Operá mejor,recibí mejor/ })).toBeInTheDocument();
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });

  it("mantiene la interacción de navegación móvil y tabs de pricing", async () => {
    const user = userEvent.setup();
    render(<SaasLaunchShowcasePage />);

    await user.click(screen.getAllByRole("button", { name: "Abrir navegación" })[0]);
    expect(screen.getByRole("navigation", { name: "Navegación móvil de referencia" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "Tarifas" })[0]);
    expect(screen.queryByRole("navigation", { name: "Navegación móvil de referencia" })).not.toBeInTheDocument();

    const professionalTab = screen.getByRole("tab", { name: "Profesional" });
    await user.click(professionalTab);
    expect(professionalTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Próximamente")).toHaveLength(3);
  });

  it("expone estados accesibles de interacción del demo", async () => {
    const user = userEvent.setup();
    render(<SaasLaunchShowcasePage />);

    const likeButton = screen.getByRole("button", { name: /Dar me gusta a María Benítez/ });
    await user.click(likeButton);
    expect(likeButton).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByLabelText("Nombre completo"), "Jeni");
    await user.type(screen.getByLabelText("Correo electrónico"), "jeni@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "Demo123!");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Demo123!");
    await user.click(screen.getByRole("button", { name: "Enviar consulta" }));
    expect(screen.getByRole("status")).toHaveTextContent("sólo una demostración");
  });
});
