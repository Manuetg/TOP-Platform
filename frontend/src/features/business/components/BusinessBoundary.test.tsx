import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BusinessBoundary } from "./BusinessBoundary";
const context = vi.hoisted(() => ({ value: { status: "loading", retry: vi.fn() } }));
vi.mock("../context/BusinessContext", () => ({ useBusinessContext: () => context.value }));
describe("BusinessBoundary", () => {
  it.each([["loading", "Cargando negocio..."], ["empty", "No tenés un negocio activo disponible."], ["selection-required", "Seleccioná un negocio para continuar."], ["error", "No pudimos cargar tus negocios."]])("does not mount tenant content for %s", (status, copy) => { context.value.status = status; render(<BusinessBoundary><span>Tenant content</span></BusinessBoundary>); expect(screen.queryByText("Tenant content")).not.toBeInTheDocument(); expect(screen.getByText(copy)).toBeInTheDocument(); });
  it("renders tenant content when ready", () => { context.value.status = "ready"; render(<BusinessBoundary><span>Tenant content</span></BusinessBoundary>); expect(screen.getByText("Tenant content")).toBeInTheDocument(); });
  it("retries after an error", () => { context.value.status = "error"; context.value.retry.mockClear(); render(<BusinessBoundary><span>Tenant content</span></BusinessBoundary>); fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(context.value.retry).toHaveBeenCalledTimes(1); });
});
