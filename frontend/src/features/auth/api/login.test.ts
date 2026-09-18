import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import type { LoginRequest, LoginResponse } from "../types/auth.types";
import { login } from "./login";

vi.mock("../../../shared/api/api-client", () => ({ apiRequest: vi.fn() }));

describe("login API", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("posts the contractual credentials to the login endpoint without prior-session auth", async () => {
    const response: LoginResponse = {
      accessToken: "access-new",
      refreshToken: "refresh-new",
      tokenType: "Bearer",
      expiresIn: 900,
      user: { id: "user-1", email: "jeni@example.com", status: "ACTIVE" },
      memberships: [{ businessId: "business-1", role: "OWNER" }],
    };
    vi.mocked(apiRequest).mockResolvedValue(response);
    const credentials: LoginRequest = {
      email: "jeni@example.com",
      password: "TopPassword123!",
    };

    await expect(login(credentials)).resolves.toEqual(response);

    expect(apiRequest).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    const options = vi.mocked(apiRequest).mock.calls[0]?.[1];
    expect(options).not.toHaveProperty("accessToken");
    expect(options?.headers).toBeUndefined();
  });

  it("propagates API errors unchanged", async () => {
    const error = new Error("login rejected");
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(login({
      email: "jeni@example.com",
      password: "wrong-password",
    })).rejects.toBe(error);
  });
});
