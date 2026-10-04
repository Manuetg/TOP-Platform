import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listMessagingAutomations,
  listMessagingTemplates,
  updateMessagingAutomation,
  updateMessagingSettings,
} from "./messaging.api";

describe("messaging api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads and updates settings in the active business", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ businessId: "business-2", botEnabled: false }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await updateMessagingSettings("business-2", false, "token");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/businesses/business-2/messaging/settings"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ botEnabled: false }) }));
  });

  it("uses provider-neutral automation and template contracts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }));
    await listMessagingAutomations("business-1");
    await listMessagingTemplates("business-1");
    await updateMessagingAutomation("business-1", "BOOKING_CONFIRMED", true);
    expect(fetchMock.mock.calls[0][0].toString()).toContain("/businesses/business-1/messaging/automations");
    expect(fetchMock.mock.calls[1][0].toString()).toContain("/businesses/business-1/messaging/templates");
    expect(fetchMock.mock.calls[2][0].toString()).toContain("BOOKING_CONFIRMED");
  });
});

