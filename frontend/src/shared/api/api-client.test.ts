import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, configureUnauthorizedRecovery } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  configureUnauthorizedRecovery(null);
});

describe("apiRequest", () => {
  it("adds the bearer token when an access token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/test", {
      accessToken: "token-123",
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);

    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("does not add authorization when no token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/test");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);

    expect(headers.has("Authorization")).toBe(false);
  });

  it("preserves custom headers and explicit authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/test", {
      accessToken: "ignored-token",
      headers: {
        Authorization: "Custom credentials",
        "X-Test": "value",
      },
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);

    expect(headers.get("Authorization")).toBe("Custom credentials");
    expect(headers.get("X-Test")).toBe("value");
  });

  it("does not force a Content-Type header for FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "resource.jpg", {
        type: "image/jpeg",
      }),
    );

    await apiRequest("/test", {
      method: "POST",
      body: formData,
    });

    const [, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    const headers = new Headers(request.headers);

    expect(headers.has("Content-Type")).toBe(false);
    expect(request.body).toBe(formData);
  });
  it("returns undefined for a 204 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiRequest<void>("/test")).resolves.toBeUndefined();
  });

  it("throws a typed ApiError with the backend message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: ["Invalid", "request"] }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(apiRequest("/test")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Invalid request",
    });
  });

  it("recovers an authenticated 401 once and retries with the new token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/private", { accessToken: "old-token" })).resolves.toEqual({ ok: true });
    expect(recover).toHaveBeenCalledWith("old-token");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer new-token");
  });

  it("does not recover public 401 or 403 and never retries twice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "no" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/auth/refresh", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled();
    await expect(apiRequest("/private", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("shares recovery for concurrent authenticated requests", async () => {
    let resolveRecovery!: (token: string) => void;
    const recovery = new Promise<string>((resolve) => { resolveRecovery = resolve; });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => init.headers && new Headers(init.headers).get("Authorization") === "Bearer new" ? Promise.resolve(new Response("{}", { status: 200 })) : Promise.resolve(new Response("", { status: 401 })));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockReturnValue(recovery);
    configureUnauthorizedRecovery({ recover });
    const requests = [1, 2, 3].map(() => apiRequest("/private", { accessToken: "old" }));
    await Promise.resolve(); resolveRecovery("new");
    await expect(Promise.all(requests)).resolves.toEqual([{}, {}, {}]);
    expect(recover).toHaveBeenCalledTimes(3);
  });
});


