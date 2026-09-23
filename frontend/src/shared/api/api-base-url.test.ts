import { afterEach, expect, it, vi } from "vitest";

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
