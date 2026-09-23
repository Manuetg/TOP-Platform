import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateRatePlanPage } from "./CreateRatePlanPage";
import { EditRatePlanPage } from "./EditRatePlanPage";
import { SeasonalRatesPage } from "./SeasonalRatesPage";
import type { RatePlan } from "../types/pricing.types";
import { requestUrl } from "../../../../tests/request-url";

vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "user" }, accessToken: "synthetic" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: "business", activeRole: "OWNER" }) }));
const plan: RatePlan = { id: "plan", businessId: "business", name: "Tarifa QA", description: null, baseNightlyAmountMinor: 450000, currency: "PYG", status: "ACTIVE", validFrom: null, validTo: null, resources: [], createdAt: "2026-01-01Z", updatedAt: "2026-01-01Z" };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("Pricing PYG con formulario, QueryClient y transporte reales", () => {
  it.each(["crear", "editar", "temporada"])("%s envía el mismo entero que muestra al usuario", async (flow) => {
    const mutations: { method?: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname;
      if (init.method === "POST" || init.method === "PATCH") { const body = JSON.parse(String(init.body)); mutations.push({ method: init.method, body }); return Promise.resolve(new Response(JSON.stringify({ ...plan, ...body }), { status: 200 })); }
      return Promise.resolve(new Response(JSON.stringify(path.endsWith("/rate-plans") ? [plan] : [])));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/app/pricing/plan/${flow}`]}><Routes><Route path="/app/pricing/:ratePlanId/:action" element={flow === "crear" ? <CreateRatePlanPage /> : flow === "editar" ? <EditRatePlanPage /> : <SeasonalRatesPage />} /><Route path="/app/pricing" element={<h1>Tarifas guardadas</h1>} /></Routes></MemoryRouter></QueryClientProvider>);
    if (flow === "temporada") await userEvent.click(await screen.findByRole("button", { name: /Nueva temporada/ }));
    if (flow === "editar") expect(await screen.findByRole("textbox", { name: /^Tarifa base por noche/ })).toHaveValue("450.000");
    else { await userEvent.type(await screen.findByRole("textbox", { name: "Nombre" }), "Tarifa prueba"); await userEvent.type(screen.getByRole("textbox", { name: flow === "crear" ? /^Tarifa base por noche/ : /^Importe por noche/ }), "450.000"); }
    if (flow === "temporada") { fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-12-01" } }); fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-12-05" } }); }
    await userEvent.click(screen.getByRole("button", { name: flow === "crear" ? "Crear plan" : flow === "editar" ? "Guardar cambios" : "Crear temporada" }));
    await waitFor(() => expect(mutations).toHaveLength(1));
    expect(mutations[0].body[flow === "temporada" ? "amountMinor" : "baseNightlyAmountMinor"]).toBe(450000);
  });
});
