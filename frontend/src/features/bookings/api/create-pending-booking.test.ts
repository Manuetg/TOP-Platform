import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { requestUrl } from "../../../../tests/request-url";
import type { CreatePendingBookingInput } from "../types/booking.types";
import { createPendingBooking } from "./create-pending-booking";

const businessId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const input: CreatePendingBookingInput = {
  contactId: "33333333-3333-4333-8333-333333333333",
  resourceIds: [resourceId],
  checkInDate: "2026-10-10",
  checkOutDate: "2026-10-12",
  adults: 2,
  children: 0,
  notes: "Reserva de prueba",
  pricing: [{ resourceId, ratePlanId: "44444444-4444-4444-8444-444444444444" }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

describe("API de creación de reserva pendiente", () => {
  beforeEach(() => configureUnauthorizedRecovery(null));
  afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });

  it("no repite POST tras 401 con credenciales de otro actor", async () => {
    const recover = vi.fn().mockResolvedValue("other-actor-token");
    configureUnauthorizedRecovery({ recover });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: "Sesión expirada." }, 401))
      .mockResolvedValueOnce(json({ id: "hypothetical-booking", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const result = await createPendingBooking({ businessId, input, accessToken: "token-current", signal: controller.signal })
      .catch((error: unknown) => error);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recover).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 401, message: "Sesión expirada." });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl(url).pathname).toBe(`/api/businesses/${businessId}/bookings/pending`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(input);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-current");
    expect(init.signal).toBe(controller.signal);
    expect(controller.signal.aborted).toBe(false);
    expect(init).not.toHaveProperty("skipUnauthorizedRecovery");
  });
});
