import { afterEach, expect, it, vi } from "vitest";
import { archiveContact } from "./archive-contact";

afterEach(() => vi.restoreAllMocks());
it("archiva por PATCH tenant-scoped con token y cancelación, sin body de estado ni actor", async () => {
  const response = { id: "contact-1", businessId: "business-1", status: "ARCHIVED" };
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }));
  const controller = new AbortController();
  await expect(archiveContact({ businessId: "business-1", contactId: "contact-1", accessToken: "token", signal: controller.signal })).resolves.toEqual(response);
  const [url, options] = fetch.mock.calls[0];
  expect(new URL(String(url), "http://localhost").pathname).toMatch(/\/businesses\/business-1\/contacts\/contact-1\/archive$/);
  expect(options).toMatchObject({ method: "PATCH", signal: controller.signal });
  expect(options?.body).toBeUndefined(); expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer token");
});
