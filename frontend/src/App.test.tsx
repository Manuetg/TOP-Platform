import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./features/auth/context/AuthContext", () => ({
  AuthProvider: () => { throw new Error("SYNTHETIC_PROVIDER_SECRET"); },
}));

it("App cubre un provider fallido con el respaldo sin contextos", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    render(<App />);
    expect(screen.getByRole("heading", { name: "La aplicación encontró un problema." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar aplicación" })).toBeEnabled();
    expect(document.body.textContent).not.toContain("SYNTHETIC_PROVIDER_SECRET");
  } finally { log.mockRestore(); }
});
