import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiResponseError, configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { requestUrl } from "../../../../tests/request-url";
import { getBusiness, updateBusiness, type BusinessUpdate } from "./business-profile";

const id = "11111111-1111-4111-8111-111111111111";
const current = { id, name: "Posada demo", legalName: null, taxId: null, country: null, region: null, city: null, address: null, timezone: "America/Asuncion", currency: "PYG", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-10-02T12:00:00.000Z" };
const changes: BusinessUpdate = { name: "Posada actualizada", legalName: "Empresa demo", taxId: "Identificación de prueba", country: "País de prueba", region: "Región de prueba", city: "Ciudad de prueba", address: "Dirección de prueba", timezone: "America/Asuncion", expectedUpdatedAt: current.updatedAt };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const operations = [
  { method: "GET", request: (signal: AbortSignal) => getBusiness(id, "token-current", signal) },
  { method: "PATCH", request: (signal: AbortSignal) => updateBusiness(id, changes, "token-current", signal) },
] as const;

describe("API del perfil del establecimiento", () => {
  beforeEach(() => configureUnauthorizedRecovery(null));
  afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });

  it("no repite PATCH tras 401 con credenciales de otro actor", async () => {
    const recover = vi.fn().mockResolvedValue("other-actor-token");
    configureUnauthorizedRecovery({ recover });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: "Sesión expirada." }, 401))
      .mockResolvedValueOnce(json(current));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const result = await updateBusiness(id, changes, "token-current", controller.signal).catch((error: unknown) => error);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recover).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 401, message: "Sesión expirada." });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl(url).pathname).toBe(`/api/businesses/${id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual(changes);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-current");
    expect(init.signal).toBe(controller.signal);
    expect(init).not.toHaveProperty("skipUnauthorizedRecovery");
  });

  it("GET conserva la recuperación de sesión y reintenta una sola vez", async () => {
    const recover = vi.fn().mockResolvedValue("renewed-token");
    configureUnauthorizedRecovery({ recover });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: "Sesión expirada." }, 401))
      .mockResolvedValueOnce(json(current));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(getBusiness(id, "token-current", controller.signal)).resolves.toEqual(current);
    expect(recover).toHaveBeenCalledExactlyOnceWith("token-current");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(requestUrl(url).pathname).toBe(`/api/businesses/${id}`);
      expect(init.method ?? "GET").toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.signal).toBe(controller.signal);
    }
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer renewed-token");
  });

  it("GET normaliza ubicación ausente a null sin inventar datos legacy", async () => {
    const { country, region, city, address, ...legacy } = current;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(legacy)));

    await expect(getBusiness(id, "token-current")).resolves.toEqual({ ...legacy, country, region, city, address });
  });

  it("PATCH limita el envío a identidad, ubicación, zona horaria y versión", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(current)); vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const input = { ...changes, id: "otro", currency: "USD", status: "ARCHIVED", reason: "No enviar", actorId: "otro", logoUrl: "https://example.test/logo.svg" };
    await updateBusiness(id, input, "token-current", controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl(url).pathname).toBe(`/api/businesses/${id}`);
    expect(init.method).toBe("PATCH"); expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-current");
    expect(JSON.parse(String(init.body))).toEqual(changes);
  });

  it("PATCH conserva la diferencia entre ubicación omitida y borrado explícito", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(current))); vi.stubGlobal("fetch", fetchMock);
    const { country: _country, region: _region, city: _city, address: _address, ...partial } = changes;
    await updateBusiness(id, partial, "token-current", new AbortController().signal);
    await updateBusiness(id, { ...partial, country: null, region: null, city: null, address: null }, "token-current", new AbortController().signal);

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(partial);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ ...partial, country: null, region: null, city: null, address: null });
  });

  describe.each(operations)("$method", ({ request }) => {
    it.each([
      ["otro establecimiento", { ...current, id: "22222222-2222-4222-8222-222222222222" }],
      ["perfil vacío", null], ["objeto incompleto", {}],
      ["país no textual", { ...current, country: 42 }], ["región no textual", { ...current, region: false }],
      ["ciudad no textual", { ...current, city: ["Ciudad"] }], ["dirección no textual", { ...current, address: {} }],
      ["versión ausente", { ...current, updatedAt: undefined }],
      ["versión sin milisegundos", { ...current, updatedAt: "2026-10-02T12:00:00Z" }],
      ["versión con offset", { ...current, updatedAt: "2026-10-02T09:00:00.000-03:00" }],
      ["fecha normalizada por parser", { ...current, updatedAt: "2026-02-30T12:00:00.000Z" }],
    ])("rechaza respuesta con %s antes de habilitar ediciones", async (_label, body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));
      await expect(request(new AbortController().signal)).rejects.toBeInstanceOf(ApiResponseError);
    });

    it.each([401, 403, 404, 409, 500])("propaga rechazo HTTP %s", async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "No disponible." }, status)));
      await expect(request(new AbortController().signal)).rejects.toBeInstanceOf(ApiError);
    });

    it("descarta respuesta tardía de un establecimiento cancelado", async () => {
      let resolve!: (value: Response) => void;
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })));
      const controller = new AbortController(); const pending = request(controller.signal);
      const reason = new DOMException("Contexto anterior", "AbortError"); controller.abort(reason); resolve(json(current));
      await expect(pending).rejects.toBe(reason);
    });
  });
});
