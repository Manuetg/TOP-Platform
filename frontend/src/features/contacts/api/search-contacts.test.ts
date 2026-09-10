import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { searchContacts } from "./search-contacts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchContacts", () => {
  it("requests all contacts for the selected business", async () => {
    const response = [
      {
        id: "contact-1",
        businessId: "business-1",
        name: "Juan",
        lastName: "Pérez",
        fullName: "Juan Pérez",
        phone: "0981123456",
        whatsapp: "0981123456",
        email: "juan@example.com",
        documentType: "CI",
        documentNumber: "1234567",
        country: "Paraguay",
        city: "Asunción",
        status: "ACTIVE",
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchContacts({
        businessId: "business-1",
        accessToken: "token-123",
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    const headers = new Headers(request.headers);

    expect(url).toContain(
      "/businesses/business-1/contacts",
    );

    expect(url).not.toContain("?query=");
    expect(request.method).toBe("GET");

    expect(headers.get("Authorization")).toBe(
      "Bearer token-123",
    );
  });

  it("encodes the contact search query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await searchContacts({
      businessId: "business-1",
      query: "  Juan Pérez  ",
      accessToken: "token-123",
    });

    const [url] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toContain(
      "/businesses/business-1/contacts?query=Juan%20P%C3%A9rez",
    );
  });
});