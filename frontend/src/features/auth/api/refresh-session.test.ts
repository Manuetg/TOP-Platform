import { afterEach, expect, it, vi } from "vitest";
import { refreshSession } from "./refresh-session";
afterEach(() => vi.unstubAllGlobals());
it("posts the refresh token and maps the response", async () => { const response = { accessToken: "new-a", refreshToken: "new-r", tokenType: "Bearer", expiresIn: 900 }; const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })); vi.stubGlobal("fetch", request); await expect(refreshSession("old-r")).resolves.toEqual(response); const [url, init] = request.mock.calls[0] as [string, RequestInit]; expect(url).toContain("/auth/refresh"); expect(init.method).toBe("POST"); expect(init.body).toBe(JSON.stringify({ refreshToken: "old-r" })); });
