import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_ERROR_MESSAGES,
  ApiError,
  ApiResponseError,
  ApiTransportError,
  apiRequest,
  configureUnauthorizedRecovery,
} from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  configureUnauthorizedRecovery(null);
});

function httpError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("apiRequest", () => {
  it("adds the bearer token when an access token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/test", { accessToken: "token-123" });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("does not add authorization when no token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/test");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("Authorization")).toBe(false);
  });

  it("preserves custom headers and explicit authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/test", { accessToken: "ignored", headers: { Authorization: "Custom credentials", "X-Test": "value", "Idempotency-Key": "same-key" } });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe("Custom credentials");
    expect(headers.get("X-Test")).toBe("value");
    expect(headers.get("Idempotency-Key")).toBe("same-key");
  });

  it("does not force Content-Type for FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new File(["image"], "resource.jpg", { type: "image/jpeg" }));
    await apiRequest("/test", { method: "POST", body: formData });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).has("Content-Type")).toBe(false);
    expect(request.body).toBe(formData);
  });

  it("returns undefined for 204 without reading its body", async () => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204, json }));
    await expect(apiRequest<void>("/test")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("preserves a valid backend message and ApiError compatibility", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(httpError(400, { message: ["Invalid", "request"] })));
    await expect(apiRequest("/test")).rejects.toEqual(new ApiError(400, "Invalid request"));
  });

  it.each([
    ["missing", {}],
    ["empty", { message: "  " }],
    ["wrong type", { message: 42 }],
    ["null message", { message: null }],
    ["empty list", { message: [] }],
    ["mixed array", { message: ["valid", 42] }],
    ["null body", null],
  ])("uses a safe HTTP fallback for %s error body", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(httpError(409, body)));
    await expect(apiRequest("/test")).rejects.toEqual(new ApiError(409, API_ERROR_MESSAGES.http));
  });

  it("uses a safe fallback for non-JSON HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>internal</html>", { status: 404 })));
    await expect(apiRequest("/test")).rejects.toEqual(new ApiError(404, API_ERROR_MESSAGES.http));
  });

  it.each([400, 401, 403, 404, 409, 500, 503])("keeps the HTTP status %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(httpError(status, { message: "Internal SQL detail" })));
    const expectedMessage = status >= 500 ? API_ERROR_MESSAGES.server : "Internal SQL detail";
    await expect(apiRequest("/test")).rejects.toEqual(new ApiError(status, expectedMessage));
  });

  it("uses the same HTTP error interpretation for a retry response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpError(401, { message: "stale" }))
      .mockResolvedValueOnce(httpError(409, { message: ["Conflict", "detail"] }));
    vi.stubGlobal("fetch", fetchMock);
    configureUnauthorizedRecovery({ recover: vi.fn().mockResolvedValue("new-token") });
    await expect(apiRequest("/private", { accessToken: "old-token" })).rejects.toEqual(new ApiError(409, "Conflict detail"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("wraps fetch transport failures with a safe typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed to fetch: secret detail")));
    await expect(apiRequest("/test")).rejects.toEqual(new ApiTransportError());
  });

  it("does not trigger auth recovery for transport failures or server errors", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("failed to fetch"))
      .mockResolvedValueOnce(httpError(503, { message: "private server detail" }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/private", { accessToken: "old" })).rejects.toBeInstanceOf(ApiTransportError);
    await expect(apiRequest("/private", { accessToken: "old" })).rejects.toEqual(new ApiError(503, API_ERROR_MESSAGES.server));
    expect(recover).not.toHaveBeenCalled();
  });

  it("does not reinterpret arbitrary programming exceptions as transport failures", async () => {
    const error = new Error("programming failure");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(apiRequest("/test")).rejects.toBe(error);
  });

  it("returns a controlled typed error for malformed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(apiRequest("/test")).rejects.toEqual(new ApiResponseError());
  });

  it("preserves cancellation before fetch resolves", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Cancelled", "AbortError");
    const fetchMock = vi.fn((_input: RequestInfo | URL, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(abortError), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const request = apiRequest("/test", { signal: controller.signal });
    controller.abort(abortError);
    await expect(request).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves cancellation while reading the response body", async () => {
    const controller = new AbortController();
    let resolveBody!: (value: unknown) => void;
    const body = new Promise((resolve) => { resolveBody = resolve; });
    const abortError = new DOMException("Cancelled", "AbortError");
    const response = { ok: true, status: 200, json: vi.fn().mockReturnValue(body) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const request = apiRequest("/test", { signal: controller.signal });
    await vi.waitFor(() => expect(response.json).toHaveBeenCalledOnce());
    controller.abort(abortError);
    resolveBody({ ok: true });
    await expect(request).rejects.toBe(abortError);
  });

  it("does not retry a request cancelled while waiting for auth recovery", async () => {
    const controller = new AbortController();
    let resolveRecovery!: (token: string) => void;
    const recovery = new Promise<string>((resolve) => { resolveRecovery = resolve; });
    const fetchMock = vi.fn().mockResolvedValue(httpError(401, { message: "expired" }));
    vi.stubGlobal("fetch", fetchMock);
    configureUnauthorizedRecovery({ recover: vi.fn().mockReturnValue(recovery) });
    const request = apiRequest("/private", { accessToken: "old", signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    resolveRecovery("new");
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers an authenticated 401 once and retries with the replacement token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpError(401, { message: "expired" }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/private", { accessToken: "old-token" })).resolves.toEqual({ ok: true });
    expect(recover).toHaveBeenCalledWith("old-token");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer new-token");
  });

  it("does not recover public 401, authenticated 403, or excluded auth endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpError(401, { message: "no" }))
      .mockResolvedValueOnce(httpError(401, { message: "no" }))
      .mockResolvedValueOnce(httpError(401, { message: "no" }))
      .mockResolvedValueOnce(httpError(401, { message: "no" }))
      .mockResolvedValueOnce(httpError(403, { message: "forbidden" }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/auth/refresh", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest("/auth/logout", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest("/auth/login", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest("/private")).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest("/private", { accessToken: "old" })).rejects.toMatchObject({ status: 403 });
    expect(recover).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("retries a failed authenticated request at most once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(401, { message: "expired" }));
    vi.stubGlobal("fetch", fetchMock);
    const recover = vi.fn().mockResolvedValue("new-token");
    configureUnauthorizedRecovery({ recover });
    await expect(apiRequest("/private", { accessToken: "old" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("preserves method, body, signal, custom headers and idempotency key on retry", async () => {
    const controller = new AbortController();
    const body = JSON.stringify({ value: "x" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpError(401, { message: "expired" }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    configureUnauthorizedRecovery({ recover: vi.fn().mockResolvedValue("new") });
    await apiRequest("/private", { method: "POST", body, signal: controller.signal, accessToken: "old", headers: { "X-Custom": "yes", "Idempotency-Key": "stable" } });
    const retried = fetchMock.mock.calls[1][1] as RequestInit;
    expect(retried.method).toBe("POST");
    expect(retried.body).toBe(body);
    expect(retried.signal).toBe(controller.signal);
    expect(new Headers(retried.headers).get("X-Custom")).toBe("yes");
    expect(new Headers(retried.headers).get("Idempotency-Key")).toBe("stable");
    expect(new Headers(retried.headers).get("Authorization")).toBe("Bearer new");
  });
});
