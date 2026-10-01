import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/api-client";
import type { MembershipRole } from "../../auth/types/auth.types";
import { updateResource } from "../api/update-resource";
import type { Resource } from "../types/resource.types";
import { EditResourcePage } from "./EditResourcePage";

const context = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  businessId: "business-1",
  role: "OWNER" as MembershipRole | null,
}));
vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({ session: context.userId ? {
    accessToken: `access-${context.userId}`, user: { id: context.userId },
  } : null }),
}));
vi.mock("../../business/context/BusinessContext", () => ({
  useBusinessContext: () => ({ activeBusinessId: context.businessId, activeRole: context.role }),
}));
vi.mock("../api/update-resource", () => ({ updateResource: vi.fn() }));
const saveResource = vi.mocked(updateResource);

function resource(businessId = "business-1", id = "resource-1"): Resource {
  return {
    id, businessId, name: `Cabaña ${id}`, internalCode: "CAB-01", description: "Vista al lago",
    capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2,
    status: "ACTIVE", sortOrder: 1, amenities: [],
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function AnimatedEditor({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return <>
    <button onClick={() => setOpen(false)}>Ocultar diálogo</button>
    <AnimatePresence>
      {open ? <motion.div key="editor" exit={{ opacity: 0 }} transition={{ duration: 10 }}>
        <EditResourcePage embedded onClose={onClose} />
      </motion.div> : null}
    </AnimatePresence>
  </>;
}
function show({ embedded = false, animated = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const onClose = vi.fn();
  const tree = () => <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/app/resources/resource-1/edit"]}>
      <Location />
      <Link to="/app/resources/resource-2/edit">Otro recurso</Link>
      <Routes>
        <Route path="/app/resources/:resourceId/edit" element={animated
          ? <AnimatedEditor onClose={onClose} />
          : <EditResourcePage embedded={embedded} onClose={onClose} />} />
        <Route path="/app/resources/:resourceId" element={<p>Detalle del recurso</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, onClose, refresh: () => view.rerender(tree()) };
}
async function beginSave() {
  const input = await screen.findByLabelText("Nombre");
  await userEvent.clear(input);
  await userEvent.type(input, "Nombre actualizado");
  await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(saveResource).toHaveBeenCalledTimes(1));
  return saveResource.mock.calls[0][0].signal!;
}

describe("EditResourcePage request lifetime and permissions", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); saveResource.mockReset();
    context.userId = "user-1"; context.businessId = "business-1"; context.role = "OWNER";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const match = path.match(/\/businesses\/([^/]+)\/resources\/([^/]+)$/);
      if (!match) throw new Error(`Unexpected request: ${path}`);
      return new Response(JSON.stringify(resource(match[1], match[2])), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
  });

  it.each(["RECEPTIONIST", "VIEWER", null] as const)("denies the direct edit route for %s", (role) => {
    context.role = role;
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para editar");
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(saveResource).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"] as const)("saves and navigates normally for %s", async (role) => {
    context.role = role;
    const updated = { ...resource(), name: "Nombre actualizado" };
    saveResource.mockResolvedValue(updated);
    const view = show();
    await beginSave();
    await screen.findByText("Detalle del recurso");
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toEqual(updated);
    expect(saveResource.mock.calls[0][0]).toMatchObject({ businessId: "business-1", resourceId: "resource-1", accessToken: "access-user-1" });
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it("locks duplicate submits before asynchronous form validation", async () => {
    const pending = deferred<Resource>(); saveResource.mockReturnValue(pending.promise);
    show();
    const input = await screen.findByLabelText("Nombre");
    const form = input.closest("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(saveResource).toHaveBeenCalledTimes(1));
    await act(async () => { pending.resolve(resource()); await pending.promise; });
  });

  it.each([400, 403, 409])("keeps fields and reports a current backend %s error", async (status) => {
    saveResource.mockRejectedValue(new ApiError(status, "No se pudo guardar este recurso."));
    const view = show();
    await beginSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar este recurso.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Nombre actualizado");
    expect(screen.getByTestId("location")).toHaveTextContent("/app/resources/resource-1/edit");
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toEqual(resource());
  });

  it("aborts immediately when closing even if the caller leaves the form mounted", async () => {
    const pending = deferred<Resource>(); saveResource.mockReturnValue(pending.promise);
    const view = show({ embedded: true });
    const signal = await beginSave();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar edición" }));
    expect(signal.aborted).toBe(true);
    expect(view.onClose).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ ...resource(), name: "Respuesta tardía" }); await pending.promise; });
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toEqual(resource());
    expect(view.onClose).toHaveBeenCalledTimes(1);
  });

  it("aborts at the start of an animated exit before the form unmounts", async () => {
    const pending = deferred<Resource>(); saveResource.mockReturnValue(pending.promise);
    const view = show({ animated: true });
    const signal = await beginSave();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar diálogo" }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    await act(async () => { pending.resolve({ ...resource(), name: "Respuesta tardía" }); await pending.promise; });
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toEqual(resource());
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it.each(["business", "resource", "identity", "role", "logout", "unmount"] as const)("discards a late success after changing %s", async (change) => {
    const pending = deferred<Resource>(); saveResource.mockReturnValue(pending.promise);
    const view = show();
    const signal = await beginSave();
    if (change === "resource") await userEvent.click(screen.getByRole("link", { name: "Otro recurso" }));
    else if (change === "unmount") view.unmount();
    else act(() => {
      if (change === "business") context.businessId = "business-2";
      if (change === "identity") context.userId = "user-2";
      if (change === "role") context.role = "VIEWER";
      if (change === "logout") context.userId = null;
      view.refresh();
    });
    expect(signal.aborted).toBe(true);
    act(() => { view.client.clear(); });
    await act(async () => { pending.resolve({ ...resource(), name: "Respuesta tardía" }); await pending.promise; });
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toBeUndefined();
    expect(view.onClose).not.toHaveBeenCalled();
    if (change !== "unmount") expect(screen.getByTestId("location")).toHaveTextContent(
      change === "resource" ? "/app/resources/resource-2/edit" : "/app/resources/resource-1/edit",
    );
  });

  it("does not navigate after logout while list invalidation is pending", async () => {
    saveResource.mockResolvedValue({ ...resource(), name: "Nombre actualizado" });
    const view = show();
    const invalidation = deferred<void>();
    vi.spyOn(view.client, "invalidateQueries").mockReturnValue(invalidation.promise);
    const signal = await beginSave();
    await waitFor(() => expect(view.client.invalidateQueries).toHaveBeenCalled());
    act(() => { context.userId = null; view.refresh(); view.client.clear(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { invalidation.resolve(); await invalidation.promise; });
    expect(screen.getByTestId("location")).toHaveTextContent("/app/resources/resource-1/edit");
    expect(view.client.getQueryData(["resources", "business-1", "resource-1"])).toBeUndefined();
  });
});
