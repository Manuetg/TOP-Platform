import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import { logout } from "./logout";

vi.mock("../../../shared/api/api-client", () => ({ apiRequest: vi.fn() }));

describe("logout", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("posts the current refresh token without an access token", async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined);

    await expect(logout("refresh-current")).resolves.toBeUndefined();

    expect(apiRequest).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "refresh-current" }),
    });
  });

  it("propagates remote logout errors", async () => {
    const error = new Error("remote unavailable");
    vi.mocked(apiRequest).mockImplementation(() => {
      throw error;
    });

    let caught: unknown;
    try {
      await logout("refresh-current");
    } catch (reason) {
      caught = reason;
    }

    expect(caught).toBe(error);
  });
});
