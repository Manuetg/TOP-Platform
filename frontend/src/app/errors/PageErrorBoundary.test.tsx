import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { ErrorFallback } from "./ErrorFallback";
import { useEffect } from "react";

const state = vi.hoisted(() => ({ userId: "user-1", businessId: "business-1", fails: true, mounts: vi.fn() }));
vi.mock("../../features/auth/context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: state.userId } } }) }));
vi.mock("../../features/business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: state.businessId }) }));

function Content() {
  useEffect(() => { state.mounts(); }, []);
  if (state.fails) throw new Error("SYNTHETIC_PRIVATE");
  return <p>Contenido recuperado</p>;
}
function Page() {
  return <MemoryRouter><Routes><Route element={<PageErrorBoundary />}><Route path="/" element={<Content />} /></Route></Routes></MemoryRouter>;
}
beforeEach(() => {
  Object.assign(state, { userId: "user-1", businessId: "business-1", fails: true });
  state.mounts.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it.each(["userId", "businessId"] as const)("descarta el fallback anterior al cambiar %s sin navegar", (key) => {
  const view = render(<Page />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  state[key] = "identity-2";
  state.fails = false;
  view.rerender(<Page />);
  expect(screen.getByText("Contenido recuperado")).toBeInTheDocument();
});

it("no remonta contenido sano al cambiar la clave de recuperación", () => {
  state.fails = false;
  const view = render(<ErrorBoundary resetKey="a" fallback={() => <ErrorFallback general />}><Content /></ErrorBoundary>);
  view.rerender(<ErrorBoundary resetKey="b" fallback={() => <ErrorFallback general />}><Content /></ErrorBoundary>);
  expect(state.mounts).toHaveBeenCalledOnce();
});

it("captura un fallo superior sin depender de contextos", () => {
  render(<ErrorBoundary fallback={() => <ErrorFallback general />}><Content /></ErrorBoundary>);
  expect(screen.getByRole("heading", { name: "La aplicación encontró un problema." })).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("SYNTHETIC_PRIVATE");
});
