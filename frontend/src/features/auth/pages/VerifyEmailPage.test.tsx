import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailPage } from "./VerifyEmailPage";

const deps = vi.hoisted(() => ({ verifyEmail: vi.fn() }));
vi.mock("../api/verify-email", () => ({ verifyEmail: deps.verifyEmail }));

function renderVerify(initialEntry: string) {
  const router = createMemoryRouter([{ path: "/verify-email", element: <VerifyEmailPage /> }, { path: "/login", element: <p>Login</p> }], { initialEntries: [initialEntry] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

describe("VerifyEmailPage", () => {
  beforeEach(() => deps.verifyEmail.mockReset());

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
