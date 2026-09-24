const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const API_ERROR_MESSAGES = {
  http: "No pudimos completar la solicitud. Intentá nuevamente.",
  server: "El servicio no pudo completar la solicitud. Intentá nuevamente.",
  transport: "No pudimos conectar con el servicio. Intentá nuevamente.",
  invalidResponse: "El servicio devolvió una respuesta no válida. Intentá nuevamente.",
} as const;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** A request failed without receiving an HTTP response. */
export class ApiTransportError extends Error {
  constructor(message = API_ERROR_MESSAGES.transport) {
    super(message);
    this.name = "ApiTransportError";
  }
}

/** An HTTP success response did not satisfy the expected JSON contract. */
export class ApiResponseError extends Error {
  constructor(message = API_ERROR_MESSAGES.invalidResponse) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export interface ApiRequestOptions extends RequestInit {
  accessToken?: string | null;
}

export interface UnauthorizedRecoveryHandler {
  recover(failedAccessToken: string): Promise<string | null>;
}

let unauthorizedRecovery: UnauthorizedRecoveryHandler | null = null;
export function configureUnauthorizedRecovery(handler: UnauthorizedRecoveryHandler | null): void {
  unauthorizedRecovery = handler;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { accessToken, headers: customHeaders, ...requestOptions } = options;
  const headers = createHeaders(customHeaders, requestOptions.body, accessToken);
  const signal = requestOptions.signal;
  throwIfAborted(signal);

  const response = await fetchResponse(`${API_URL}${path}`, { ...requestOptions, headers }, signal);
  const isRefreshable = Boolean(accessToken) && response.status === 401 &&
    !isAuthEndpoint(path);

  if (isRefreshable && unauthorizedRecovery) {
    let replacement: string | null;
    try {
      replacement = await unauthorizedRecovery.recover(accessToken as string);
    } catch (error) {
      throwIfAborted(signal);
      throw error;
    }
    // Recovery is shared by AuthContext. This request's abort signal must not
    // cancel that shared refresh, but it must prevent this request's retry.
    throwIfAborted(signal);
    if (replacement) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("Authorization", `Bearer ${replacement}`);
      const retry = await fetchResponse(
        `${API_URL}${path}`,
        { ...requestOptions, headers: retryHeaders },
        signal,
      );
      return readResponse<T>(retry, signal);
    }
  }

  return readResponse<T>(response, signal);
}

function createHeaders(
  customHeaders: HeadersInit | undefined,
  body: BodyInit | null | undefined,
  accessToken: string | null | undefined,
): Headers {
  const headers = new Headers(customHeaders);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function isAuthEndpoint(path: string): boolean {
  return ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/forgot-password", "/auth/verify-reset-code", "/auth/reset-password"].some((endpoint) =>
    path === endpoint || path.startsWith(`${endpoint}?`),
  );
}

async function fetchResponse(
  input: RequestInfo | URL,
  init: RequestInit,
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  throwIfAborted(signal);
  try {
    const response = await fetch(input, init);
    throwIfAborted(signal);
    return response;
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error)) throw error;
    // Fetch reports transport failures as TypeError. Preserve all other
    // exceptions because they may indicate a programming/configuration bug.
    if (error instanceof TypeError) throw new ApiTransportError();
    throw error;
  }
}

async function readResponse<T>(response: Response, signal: AbortSignal | null | undefined): Promise<T> {
  throwIfAborted(signal);
  if (!response.ok) throw await createHttpError(response, signal);
  if (response.status === 204) return undefined as T;

  throwIfAborted(signal);
  try {
    const body: unknown = await response.json();
    throwIfAborted(signal);
    return body as T;
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error)) throw error;
    if (error instanceof SyntaxError) throw new ApiResponseError();
    if (error instanceof TypeError) throw new ApiTransportError();
    throw error;
  }
}

async function createHttpError(
  response: Response,
  signal: AbortSignal | null | undefined,
): Promise<ApiError> {
  // Internal server details are not a user-facing contract.
  if (response.status >= 500) return new ApiError(response.status, API_ERROR_MESSAGES.server);

  let message: string = API_ERROR_MESSAGES.http;
  try {
    const body: unknown = await response.json();
    throwIfAborted(signal);
    const candidate = readContractMessage(body);
    if (candidate) message = candidate;
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error)) throw error;
    // Invalid or absent error bodies must not mask the original HTTP status.
  }
  return new ApiError(response.status, message);
}

function readContractMessage(body: unknown): string | null {
  if (body === null || typeof body !== "object" || !("message" in body)) return null;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message.trim() ? message.trim() : null;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    const joined = message.map((item: string) => item.trim()).filter(Boolean).join(" ");
    return joined || null;
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  if (typeof DOMException !== "undefined") throw new DOMException("The operation was aborted.", "AbortError");
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  throw error;
}
