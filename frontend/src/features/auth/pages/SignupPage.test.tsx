import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupPage } from "./SignupPage";

const deps = vi.hoisted(() => ({ signup: vi.fn(), resend: vi.fn() }));
vi.mock("../api/signup", () => ({ signup: deps.signup }));
vi.mock("../api/resend-verification", () => ({ resendVerification: deps.resend }));

function renderSignup() {
  const router = createMemoryRouter([{ path: "/signup", element: <SignupPage /> }, { path: "/login", element: <p>Login</p> }], { initialEntries: ["/signup"] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

describe("SignupPage", () => {
  beforeEach(() => { deps.signup.mockReset(); deps.resend.mockReset(); });

  it("validates step one and preserves values when moving back from step two", () => {
    renderSignup();
    const fields = screen.getAllByRole("textbox");
    fireEvent.change(fields[0], { target: { value: "Ana" } });
    fireEvent.change(fields[1], { target: { value: "ana@example.com" } });
    const inputs = document.querySelectorAll("input");
    fireEvent.change(inputs[2], { target: { value: "Password12345!" } });
    fireEvent.change(inputs[3], { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    fireEvent.change(document.querySelectorAll("input")[3], { target: { value: "Password12345!" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Contanos sobre tu alojamiento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("Ana");
  });

  it("shows timezone default and submits normalized onboarding payload", async () => {
    deps.signup.mockResolvedValue({ status: "EMAIL_VERIFICATION_REQUIRED", email: "ana@example.com" });
    renderSignup();
    const fields = screen.getAllByRole("textbox");
    fireEvent.change(fields[0], { target: { value: " Ana " } });
    fireEvent.change(fields[1], { target: { value: "ana@example.com" } });
    const inputs = document.querySelectorAll("input");
    fireEvent.change(inputs[2], { target: { value: "Password12345!" } });
    fireEvent.change(inputs[3], { target: { value: "Password12345!" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByLabelText("Zona horaria")).toHaveValue("America/Asuncion");
    fireEvent.change(document.querySelectorAll("input")[0], { target: { value: " Casa TOP " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(deps.signup).toHaveBeenCalledWith(expect.objectContaining({ displayName: " Ana ", businessName: " Casa TOP ", timezone: "America/Asuncion" })));
    expect(await screen.findByRole("heading", { name: "Revisá tu correo" })).toBeInTheDocument();
  });

  it("resends verification and enforces the 60 second cooldown", async () => {
    deps.signup.mockResolvedValue({ status: "EMAIL_VERIFICATION_REQUIRED", email: "ana@example.com" });
    deps.resend.mockResolvedValue({ status: "VERIFICATION_EMAIL_SENT_IF_ELIGIBLE" });
    renderSignup();
    const inputs = document.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "Ana" } }); fireEvent.change(inputs[1], { target: { value: "ana@example.com" } }); fireEvent.change(inputs[2], { target: { value: "Password12345!" } }); fireEvent.change(inputs[3], { target: { value: "Password12345!" } }); fireEvent.click(screen.getByRole("button", { name: "Continuar" })); fireEvent.change(document.querySelectorAll("input")[0], { target: { value: "Casa" } }); fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar correo" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reenviar correo" }));
    await act(async () => { await Promise.resolve(); });
    expect(deps.resend).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByRole("button", { name: /Reenviar en 60s/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reenviar en 60s/ })).toBeDisabled();
  });
});
