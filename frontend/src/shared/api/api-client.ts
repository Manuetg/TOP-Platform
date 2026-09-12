const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiErrorBody {
  message?: string | string[];
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
  const {
    accessToken,
    headers: customHeaders,
    ...requestOptions
  } = options;

  const headers = new Headers(customHeaders);

  const isFormData =
    typeof FormData !== "undefined" &&
    requestOptions.body instanceof FormData;

  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const request = {
    ...requestOptions,
    headers,
  };
  const response = await fetch(`${API_URL}${path}`, request);

  const isRefreshable = Boolean(accessToken) && response.status === 401 &&
    !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh") && !path.startsWith("/auth/logout");
  if (isRefreshable && unauthorizedRecovery) {
    const replacement = await unauthorizedRecovery.recover(accessToken as string);
    if (replacement) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("Authorization", `Bearer ${replacement}`);
      const retry = await fetch(`${API_URL}${path}`, { ...requestOptions, headers: retryHeaders });
      if (retry.ok) {
        if (retry.status === 204) return undefined as T;
        return retry.json() as Promise<T>;
      }
      return handleError<T>(retry);
    }
  }

  if (!response.ok) {
    let message = "No pudimos completar la acción.";

    try {
      const body = (await response.json()) as ApiErrorBody;

      if (Array.isArray(body.message)) {
        message = body.message.join(" ");
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      // Si el backend no devuelve JSON, conservamos el mensaje genérico.
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function handleError<T>(response: Response): Promise<T> {
  let message = "No pudimos completar la acción.";
  try { const body = (await response.json()) as ApiErrorBody; message = Array.isArray(body.message) ? body.message.join(" ") : body.message ?? message; } catch { /* mensaje genérico */ }
  throw new ApiError(response.status, message);
}
