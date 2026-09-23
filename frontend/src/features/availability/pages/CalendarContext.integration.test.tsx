import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityCalendarPage } from "./AvailabilityCalendarPage";
import { requestUrl } from "../../../../tests/request-url";

const context = vi.hoisted(() => ({ businessId: "a", userId: "one" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: context.businessId }) }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: context.userId }, accessToken: `token-${context.userId}` } }) }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function response(path: string, name: string) {
  return new Response(JSON.stringify(path.endsWith("/resources") ? [{ id: name, name, businessId: context.businessId, internalCode: name, status: "ACTIVE", sortOrder: 0, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, amenities: [] }] : path.endsWith("/calendar") ? { from: "2026-09-01", to: "2026-10-01", resources: [] } : []));
}
const clients: QueryClient[] = [];
beforeEach(() => { Object.assign(context, { businessId: "a", userId: "one" }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("Calendar con hooks, QueryClient y transporte reales", () => {
  it.each(["Business", "identidad", "desmontaje"])("%s cancela las cinco lecturas y descarta respuestas antiguas", async (change) => {
    const calls: { path: string; signal?: AbortSignal | null; pending: ReturnType<typeof deferred<Response>> }[] = [];
    let old = true;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname; const pending = deferred<Response>();
      calls.push({ path, signal: init.signal, pending }); return old ? pending.promise : Promise.resolve(response(path, "Recurso nuevo B"));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); client.setQueryData(["unrelated"], "conservar");
    const tree = () => <QueryClientProvider client={client}><MemoryRouter><AvailabilityCalendarPage key={`${context.userId}:${context.businessId}`} /></MemoryRouter></QueryClientProvider>;
    const view = render(tree()); await waitFor(() => expect(calls).toHaveLength(5)); const first = calls.slice();
    expect(first.every((call) => call.path.includes("/businesses/a/"))).toBe(true);
    old = false;
    if (change === "desmontaje") view.unmount();
    else { if (change === "Business") context.businessId = "b"; else context.userId = "two"; view.rerender(tree()); await screen.findAllByText("Recurso nuevo B"); }
    expect(first.every((call) => call.signal?.aborted)).toBe(true);
    await act(async () => { for (const call of first) call.pending.resolve(response(call.path, "Recurso antiguo A")); });
    expect(screen.queryByText("Recurso antiguo A")).not.toBeInTheDocument();
    expect(client.getQueryData(["unrelated"])).toBe("conservar");
    if (change !== "desmontaje") { expect(calls).toHaveLength(10); expect(screen.getAllByText("Recurso nuevo B").length).toBeGreaterThan(0); }
  });
});
