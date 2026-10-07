import { afterEach, expect, it, vi } from "vitest";

it("usa /api sin otro origen en el perfil piloto", async () => {
  vi.stubEnv("VITE_DEPLOYMENT_PROFILE", "lan-pilot");
  vi.stubEnv("VITE_API_URL", "/api");
  vi.resetModules();
  const request = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", request);
  const { apiRequest } = await import("./api-client");
  await apiRequest("/auth/login", { method: "POST" });
  expect(request.mock.calls[0][0]).toBe("/api/auth/login");
});

it("rechaza configuración piloto ajena antes de enviar solicitudes", async () => {
  vi.stubEnv("VITE_DEPLOYMENT_PROFILE", "lan-pilot");
  vi.stubEnv("VITE_API_URL", "https://external.example/api");
  vi.resetModules();
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(import("./api-client")).rejects.toThrow("VITE_API_URL debe ser /api");
  expect(request).not.toHaveBeenCalled();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(["/api", "https://api.top.example/api"])(
  "preserva la base configurada %s en requests autenticadas",
  async (base) => {
    vi.stubEnv("VITE_API_URL", base);
    vi.resetModules();
    const request = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", request);
    const { apiRequest } = await import("./api-client");
    await expect(apiRequest("/businesses/business-a", { accessToken: "test-token" })).resolves.toEqual({ ok: true });
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${base}/businesses/business-a`);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-token");
  },
);
