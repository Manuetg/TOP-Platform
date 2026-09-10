import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createContact } from "./create-contact";

describe("createContact", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a contact using the business-scoped endpoint", async () => {
    const response = {
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
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    const result = await createContact({
      businessId: "business-1",
      accessToken: "access-token",
      input: {
        name: "Juan",
        lastName: "Pérez",
        phone: "0981123456",
        whatsapp: "0981123456",
        email: "juan@example.com",
        documentType: "CI",
        documentNumber: "1234567",
        country: "Paraguay",
        city: "Asunción",
      },
    });

    expect(result).toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/businesses/business-1/contacts",
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(JSON.parse(String(options?.body))).toEqual({
      name: "Juan",
      lastName: "Pérez",
      phone: "0981123456",
      whatsapp: "0981123456",
      email: "juan@example.com",
      documentType: "CI",
      documentNumber: "1234567",
      country: "Paraguay",
      city: "Asunción",
    });
  });
});