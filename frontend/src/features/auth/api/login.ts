import { apiRequest } from "../../../shared/api/api-client";
import type {
  LoginRequest,
  LoginResponse,
} from "../types/auth.types";

export function login(request: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
