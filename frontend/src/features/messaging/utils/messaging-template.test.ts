import { describe, expect, it } from "vitest";
import { renderMessagingTemplate, validateMessagingTemplate } from "./messaging-template";

describe("messaging templates", () => {
  it("renders the allowed variables with preview values", () => {
    expect(renderMessagingTemplate("Hola {{guestName}}, tu total es {{total}} {{currency}}.")).toContain("Hola Juan Pérez, tu total es 1.250.000 Gs.");
  });

  it("rejects unknown and malformed variables", () => {
    expect(validateMessagingTemplate("Hola {{phoneNumber}}" )).toContain("no está disponible");
    expect(validateMessagingTemplate("Hola {{guest name}}" )).toContain("formato");
    expect(validateMessagingTemplate("Hola {{guestName" )).toContain("llaves");
  });

  it("accepts the backend default contract and enforces its limit", () => {
    expect(validateMessagingTemplate("{{businessName}} {{guestName}}")).toBeNull();
    expect(validateMessagingTemplate("x".repeat(4001))).toContain("4000");
  });
});

