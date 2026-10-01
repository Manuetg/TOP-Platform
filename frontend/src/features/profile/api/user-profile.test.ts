import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_ERROR_MESSAGES,
  ApiError,
  ApiResponseError,
  configureUnauthorizedRecovery,
} from "../../../shared/api/api-client";
import { requestUrl } from "../../../../tests/request-url";
import { getUserProfile, updateUserProfile, type UpdateUserProfile, type UserProfile } from "./user-profile";

const userId = "11111111-1111-4111-8111-111111111111";
const current: UserProfile = {
  id: userId,
  email: "ana@example.test",
  displayName: "Ana López",
  status: "ACTIVE",
  updatedAt: "2026-10-01T12:30:00.000Z",
};
const changes: UpdateUserProfile = {
  displayName: "Ana renovada",
  reason: "Corrección de mi nombre",
  expectedUpdatedAt: current.updatedAt,
};
const updated = { ...current, displayName: changes.displayName, updatedAt: "2026-10-01T12:31:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const operations = [
  { method: "GET", body: undefined, request: (signal: AbortSignal) => getUserProfile(userId, "access-current", signal) },
  { method: "PATCH", body: changes, request: (signal: AbortSignal) => updateUserProfile(userId, changes, "access-current", signal) },
] as const;

describe("API del perfil personal", () => {
  beforeEach(() => configureUnauthorizedRecovery(null));
  afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });

  it.each(["Ana López", null])("GET consulta el propio perfil y admite nombre legacy %s", async (displayName) => {
    const response = { ...current, displayName };
    const fetchMock = vi.fn().mockResolvedValue(json(response));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(getUserProfile(userId, "access-current", controller.signal)).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl(url).pathname).toBe(`/api/users/${userId}/profile`);
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-current");
  });

  it("PATCH envía nombre, motivo y versión sin modificar correo ni otros campos protegidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(updated));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const input = { ...changes, email: "otra@example.test", status: "DISABLED", id: "otro-usuario" };

    await expect(updateUserProfile(userId, input, "access-current", controller.signal)).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl(url).pathname).toBe(`/api/users/${userId}/profile`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual(changes);
    expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-current");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it.each([1, 501])("PATCH conserva un motivo de %i caracteres sin imponer límites de otros flujos", async (length) => {
    const fetchMock = vi.fn().mockResolvedValue(json(updated));
    vi.stubGlobal("fetch", fetchMock);
    const body = { ...changes, reason: "a".repeat(length) };

    await expect(updateUserProfile(userId, body, "access-current", new AbortController().signal)).resolves.toEqual(updated);

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual(body);
  });

  describe.each(operations)("$method", ({ request }) => {
    it.each(["2026-10-01T12:30:00Z", "2026-10-01T09:30:00.000-03:00", "2026-10-01T12:30:00.00Z", "2026-10-01T12:30:00.0000Z"])("rechaza una versión no canónica %s para conservar el contrato de concurrencia", async (updatedAt) => {
      const response = { ...current, updatedAt };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(response)));

      await expect(request(new AbortController().signal)).rejects.toBeInstanceOf(ApiResponseError);
    });

    it.each([400, 401, 403, 404, 409, 500])("propaga el rechazo HTTP %i sin devolver un perfil", async (status) => {
      const message = "El perfil no está disponible.";
      const fetchMock = vi.fn().mockResolvedValue(json({ message }, status));
      vi.stubGlobal("fetch", fetchMock);

      await expect(request(new AbortController().signal)).rejects.toEqual(
        new ApiError(status, status >= 500 ? API_ERROR_MESSAGES.server : message),
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([
      ["identidad ajena", { ...current, id: "22222222-2222-4222-8222-222222222222" }],
      ["sin perfil", null],
      ["objeto incompleto", {}],
      ["correo inválido", { ...current, email: 42 }],
      ["nombre ausente", { id: userId, email: current.email, status: "ACTIVE", updatedAt: current.updatedAt }],
      ["nombre inválido", { ...current, displayName: { name: "Ana" } }],
      ["estado desconocido", { ...current, status: "UNKNOWN" }],
      ["versión ausente", { id: userId, email: current.email, displayName: current.displayName, status: "ACTIVE" }],
      ["versión nula", { ...current, updatedAt: null }],
      ["versión numérica", { ...current, updatedAt: 123 }],
      ["versión sin formato ISO", { ...current, updatedAt: "not-a-date" }],
      ["fecha sin hora", { ...current, updatedAt: "2026-10-01" }],
      ["instante sin zona horaria", { ...current, updatedAt: "2026-10-01T12:30:00" }],
      ["instante no interpretable", { ...current, updatedAt: "2026-13-01T12:30:00Z" }],
      ["fecha normalizada por el parser", { ...current, updatedAt: "2026-02-30T12:30:00.000Z" }],
    ])("rechaza una respuesta exitosa con %s", async (_description, body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));

      await expect(request(new AbortController().signal)).rejects.toBeInstanceOf(ApiResponseError);
    });

    it.each([
      ["sin contenido", () => new Response(null, { status: 204 })],
      ["JSON corrupto", () => new Response("not-json", { status: 200 })],
    ])("rechaza éxito %s en lugar de aceptar un perfil ausente", async (_description, response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

      await expect(request(new AbortController().signal)).rejects.toBeInstanceOf(ApiResponseError);
    });

    it("no inicia HTTP si la operación ya está cancelada", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const controller = new AbortController();
      const reason = new DOMException("Perfil cancelado", "AbortError");
      controller.abort(reason);

      await expect(request(controller.signal)).rejects.toBe(reason);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("descarta una respuesta tardía después de cancelar el perfil", async () => {
      let resolve!: (response: Response) => void;
      const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
      vi.stubGlobal("fetch", fetchMock);
      const controller = new AbortController();
      const pending = request(controller.signal);
      const reason = new DOMException("Perfil cancelado", "AbortError");

      controller.abort(reason);
      resolve(json(current));

      await expect(pending).rejects.toBe(reason);
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  it.each(operations)("renueva autenticación una vez y conserva el contrato $method al reintentar", async ({ method, body, request }) => {
    const response = method === "GET" ? current : updated;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: "Sesión expirada." }, 401))
      .mockResolvedValueOnce(json(response));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("access-renewed");
    configureUnauthorizedRecovery({ recover });
    const controller = new AbortController();

    await expect(request(controller.signal)).resolves.toEqual(response);

    expect(recover).toHaveBeenCalledExactlyOnceWith("access-current");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(requestUrl(url).pathname).toBe(`/api/users/${userId}/profile`);
      expect(init.method ?? "GET").toBe(method);
      if (body) expect(JSON.parse(String(init.body))).toEqual(body);
      else expect(init.body).toBeUndefined();
      expect(init.signal).toBe(controller.signal);
    }
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer access-renewed");
  });
});
