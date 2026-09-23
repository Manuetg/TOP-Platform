import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityCalendarPage } from "./AvailabilityCalendarPage";
import { requestUrl } from "../../../../tests/request-url";
import type { Block } from "../../blocks/types/block.types";

const context = vi.hoisted(() => ({ id: "business-a", timezone: "America/Asuncion" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: context.id, activeBusiness: { ...context } }) }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "user" }, accessToken: "synthetic" } }) }));
const clients: QueryClient[] = [];
let requests: URL[] = [];
let blocks: Block[] = [];

beforeEach(() => {
  Object.assign(context, { id: "business-a", timezone: "America/Asuncion" });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T02:30:00Z"));
  requests = []; blocks = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input instanceof Request ? input.url : input); requests.push(url);
    const result = url.pathname.endsWith("/resources") ? [{ id: "resource", businessId: context.id, name: "Habitación QA", internalCode: "QA", status: "ACTIVE", sortOrder: 0, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, amenities: [] }]
      : url.pathname.endsWith("/blocks") ? blocks
      : url.pathname.endsWith("/calendar") ? { from: url.searchParams.get("from"), to: url.searchParams.get("to"), resources: [] } : [];
    return Promise.resolve(new Response(JSON.stringify(result)));
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); vi.useRealTimers(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><AvailabilityCalendarPage /></MemoryRouter></QueryClientProvider>;
  return { ...render(tree()), tree };
}
function expectRange(path: string, from: string, to: string) {
  expect(requests.some((url) => url.pathname.endsWith(path) && url.searchParams.get("from") === from && url.searchParams.get("to") === to)).toBe(true);
}

describe("Calendar Business-local con QueryClient, hooks y transporte reales", () => {
  it("selecciona Hoy del Business y lo restaura al navegar, aunque UTC sea otro día", async () => {
    mount(); await screen.findByRole("button", { name: "23", pressed: true });
    await waitFor(() => expect(requests.length).toBe(5));
    expectRange("/availability/calendar", "2026-09-01", "2026-10-01");
    expectRange("/blocks", "2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z");
    fireEvent.change(screen.getByRole("combobox", { name: "Mes" }), { target: { value: "9" } });
    expect(screen.getByRole("button", { name: "1", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoy", exact: true }));
    expect(screen.getByRole("button", { name: "23", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mes" })).toHaveValue("8");
  });
  it("incluye en septiembre el Block de 30/09 local con timestamps UTC de 01/10", async () => {
    vi.setSystemTime(new Date("2026-10-01T02:30:00Z"));
    blocks = [{ id: "block", businessId: context.id, resourceId: "resource", type: "MAINTENANCE", reason: "Mantenimiento última noche", notes: null, startsAt: "2026-10-01T02:00:00Z", endsAt: "2026-10-01T02:59:00Z", status: "SCHEDULED", effectiveStatus: "ACTIVE", cancellationReason: null, cancelledAt: null, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z" }];
    mount();
    expect(await screen.findByTitle("Mantenimiento última noche")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Mantenimiento última noche")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mes" })).toHaveValue("8");
    expectRange("/blocks", "2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z");
  });
  it.each(["Business", "timezone del mismo Business"])("%s recalcula fecha, mes y límites sin heredar el contexto anterior", async (change) => {
    vi.setSystemTime(new Date("2026-10-01T02:30:00Z"));
    const view = mount(); await screen.findByRole("button", { name: "30", pressed: true });
    await waitFor(() => expect(requests.length).toBe(5));
    if (change === "Business") context.id = "business-b";
    context.timezone = "Asia/Tokyo";
    view.rerender(view.tree());
    expect(await screen.findByRole("button", { name: "1", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mes" })).toHaveValue("9");
    await waitFor(() => expectRange(`/businesses/${context.id}/blocks`, "2026-09-30T15:00:00.000Z", "2026-10-31T15:00:00.000Z"));
    expectRange(`/businesses/${context.id}/availability/calendar`, "2026-10-01", "2026-11-01");
  });
});
