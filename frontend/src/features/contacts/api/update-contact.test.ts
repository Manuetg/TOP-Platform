import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { updateContact } from "./update-contact";

describe("updateContact", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates a contact using PATCH on the business-scoped endpoint", async () => {
    const response = {
      id: "contact-1",
      businessId: "business-1",
      name: "Juan",
      lastName: "Gómez",
      fullName: "Juan Gómez",
      phone: "0981555555",
      whatsapp: "0981555555",
      email: "juan@example.com",
      documentType: "CI",
      documentNumber: "1234567",
      country: "Paraguay",
      city: "Encarnación",
      status: "ACTIVE",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T01:00:00.000Z",
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    const result = await updateContact({
      businessId: "business-1",
      contactId: "contact-1",
      accessToken: "access-token",
      input: {
        lastName: "Gómez",
        phone: "0981555555",
        whatsapp: "0981555555",
        city: "Encarnación",
      },
    });

    expect(result).toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/businesses/business-1/contacts/contact-1",
      ),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.any(Headers),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(JSON.parse(String(options?.body))).toEqual({
      lastName: "Gómez",
      phone: "0981555555",
      whatsapp: "0981555555",
      city: "Encarnación",
    });
  });
});