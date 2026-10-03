import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "./appRoutes";

const state = vi.hoisted(() => ({
  deployment: { profile: "lan-pilot", apiUrl: "/api" },
  status: "unauthenticated",
  emailPageMounted: vi.fn(),
}));
vi.mock("../../shared/config/deployment", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../shared/config/deployment")>(),
  deploymentConfig: state.deployment,
}));
vi.mock("../../features/auth/context/AuthContext", () => ({ useAuth: () => ({ status: state.status }) }));
vi.mock("../../features/auth/pages/SignupPage", () => ({ SignupPage: () => { state.emailPageMounted(); return <h1>Registro estándar</h1>; } }));
vi.mock("../../features/auth/pages/VerifyEmailPage", () => ({ VerifyEmailPage: () => { state.emailPageMounted(); return <h1>Verificación estándar</h1>; } }));
vi.mock("../../features/auth/pages/ForgotPasswordPage", () => ({ ForgotPasswordPage: () => { state.emailPageMounted(); return <h1>Recuperación estándar</h1>; } }));
vi.mock("../../features/auth/pages/ResetPasswordPage", () => ({ ResetPasswordPage: () => { state.emailPageMounted(); return <h1>Restablecimiento estándar</h1>; } }));
vi.mock("../../features/marketing/pages/SaasLaunchShowcasePage", () => ({ SaasLaunchShowcasePage: () => { state.emailPageMounted(); return <h1>Showcase estándar</h1>; } }));

beforeEach(() => {
  state.deployment.profile = "lan-pilot";
  state.status = "unauthenticated";
  state.emailPageMounted.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function mount(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("rutas de correo en piloto LAN", () => {
  it.each(["/signup", "/verify-email?token=sentinel", "/forgot-password", "/reset-password?token=sentinel", "/showcase/saas-launch"])(
    "bloquea %s antes de montar formularios o enviar solicitudes", (path) => {
      const router = mount(path);
      expect(screen.getByRole("heading", { name: "Correo no disponible" })).toBeVisible();
      expect(screen.getByRole("link", { name: "Volver al inicio de sesión" })).toHaveAttribute("href", "/login");
      expect(state.emailPageMounted).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("sentinel");
      expect(document.querySelector("form")).toBeNull();
      expect(router.state.location.search).toBe("");
      expect(router.state.location.hash).toBe("");
    },
  );

  it("explica la limitación también a una sesión autenticada", () => {
    state.status = "authenticated";
    mount("/forgot-password");
    expect(screen.getByRole("heading", { name: "Correo no disponible" })).toBeVisible();
    expect(state.emailPageMounted).not.toHaveBeenCalled();
  });

  it.each([
    ["/signup", "Registro estándar"],
    ["/verify-email", "Verificación estándar"],
    ["/forgot-password", "Recuperación estándar"],
    ["/reset-password", "Restablecimiento estándar"],
    ["/showcase/saas-launch", "Showcase estándar"],
  ])("conserva %s en el perfil estándar", async (path, title) => {
    state.deployment.profile = "standard";
    mount(path);
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(state.emailPageMounted).toHaveBeenCalled();
  });
});
