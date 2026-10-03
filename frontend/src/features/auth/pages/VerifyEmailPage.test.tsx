import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { ApiError } from "../../../shared/api/api-client";

const deps = vi.hoisted(() => ({ verifyEmail: vi.fn() }));
vi.mock("../api/verify-email", () => ({ verifyEmail: deps.verifyEmail }));

function renderVerify(initialEntry: string) {
  const router = createMemoryRouter([{ path: "/verify-email", element: <VerifyEmailPage /> }, { path: "/login", element: <p>Login</p> }], { initialEntries: [initialEntry] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

describe("VerifyEmailPage", () => {
  beforeEach(() => { deps.verifyEmail.mockReset(); });

  it("distingue correo deshabilitado de un enlace inválido sin exponer detalles internos", async () => {
    deps.verifyEmail.mockRejectedValue(new ApiError(503, "SYNTHETIC_SECRET", "EMAIL_FEATURE_DISABLED"));
    renderVerify("/verify-email?token=sentinel");
    expect(await screen.findByRole("heading", { name: "Correo no disponible" })).toBeVisible();
    expect(screen.queryByText("Este enlace ya no es válido")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SYNTHETIC_SECRET|sentinel/);
  });

  it("verifies a token and exposes a login CTA without auto-login", async () => {
    deps.verifyEmail.mockResolvedValue({ status: "EMAIL_VERIFIED" });
    renderVerify("/verify-email?token=valid-token");
    expect(await screen.findByRole("heading", { name: "Correo verificado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(deps.verifyEmail).toHaveBeenCalledWith("valid-token");
  });

  it("handles a missing token without redirecting", async () => {
    deps.verifyEmail.mockResolvedValue({ status: "EMAIL_VERIFIED" });
    renderVerify("/verify-email");
    await waitFor(() => expect(deps.verifyEmail).toHaveBeenCalledWith(""));
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
