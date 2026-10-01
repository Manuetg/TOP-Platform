import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { CookiePolicyPage } from "./CookiePolicyPage";
import { privacyRoutes } from "../routes";

afterEach(() => vi.restoreAllMocks());

describe("Cookies y almacenamiento local", () => {
  it("explica la persistencia real y distingue las decisiones legales pendientes", () => {
    render(<CookiePolicyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Cookies y almacenamiento local" })).toBeInTheDocument();
    expect(screen.getByText(/La entrada local no tiene una fecha de borrado automático/)).toBeInTheDocument();
    expect(screen.getByText(/aunque la autorización de recuperación ya haya vencido/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Información legal pendiente de validación" })).toBeInTheDocument();
    expect(screen.getByText(/Borrar los datos del navegador no elimina registros del servidor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aceptar|rechazar/i })).not.toBeInTheDocument();
  });

  it("se puede consultar con storage bloqueado sin leer credenciales ni escribir preferencias", () => {
    const unavailable = () => { throw new DOMException("Storage bloqueado", "SecurityError"); };
    const reads = vi.spyOn(Storage.prototype, "getItem").mockImplementation(unavailable);
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(unavailable);
    const removals = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(unavailable);
    const clears = vi.spyOn(Storage.prototype, "clear").mockImplementation(unavailable);
    const fetch = vi.spyOn(globalThis, "fetch");

    render(<CookiePolicyPage />);

    expect(screen.getByRole("heading", { name: "Gestionar tus preferencias" })).toBeInTheDocument();
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(removals).not.toHaveBeenCalled();
    expect(clears).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/cookies", "/cookies#preferencias", "/cookies#privacidad", "/cookies#informacion-legal"])("mantiene pública la ruta %s", async (path) => {
    const router = createMemoryRouter([...privacyRoutes, { path: "*", element: <h1>Ruta no encontrada</h1> }], { initialEntries: [path] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Cookies y almacenamiento local" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/cookies");
    const links = screen.getByRole("navigation", { name: "Contenido de la política" }).querySelectorAll("a");
    for (const link of links) {
      expect(document.getElementById(link.hash.slice(1))).not.toBeNull();
    }
  });
});
