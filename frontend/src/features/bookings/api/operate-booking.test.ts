import { afterEach, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { operateBooking } from "./operate-booking";

afterEach(() => {
  configureUnauthorizedRecovery(null);
  vi.unstubAllGlobals();
});

it("no reproduce una operación rechazada con 401 usando credenciales de otra sesión", async () => {
  const recover = vi.fn().mockResolvedValue("other-session-token");
  configureUnauthorizedRecovery({ recover });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Sesión expirada." }), {
    status: 401, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(operateBooking({ businessId: "business-1", bookingId: "booking-1", operation: "check-in",
    accessToken: "original-session-token", expectedUpdatedAt: "2026-10-02T12:00:00.000Z",
    signal: new AbortController().signal,
  })).rejects.toMatchObject({ status: 401, message: "Sesión expirada." });

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(recover).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("skipUnauthorizedRecovery");
});
