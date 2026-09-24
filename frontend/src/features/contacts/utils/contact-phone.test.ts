import { describe, expect, it } from "vitest";
import { normalizePhone, phonePrefix, whatsappUrl } from "./contact-phone";

describe("teléfono operativo", () => {
  it.each([["Paraguay", "0981 123 456", "+595981123456", "+595"], ["Argentina", "11 2345 6789", "+541123456789", "+54"], ["Brasil", "11 91234-5678", "+5511912345678", "+55"]])("normaliza entrada nacional de %s", (country, input, expected, prefix) => {
    expect(normalizePhone(input, country)).toBe(expected);
    expect(phonePrefix(country, input)).toBe(prefix);
  });
  it("respeta un prefijo pegado aunque difiera del país", () => {
    expect(normalizePhone("+54 11 2345 6789", "Paraguay")).toBe("+541123456789");
    expect(phonePrefix("Paraguay", "+54 11 2345 6789")).toBe("+54");
    expect(normalizePhone("00595 981 123456", "")).toBe("+595981123456");
  });
  it("valida y solo construye WhatsApp con un número internacional inequívoco", () => {
    expect(normalizePhone("0981123456", "")).toBeNull();
    expect(normalizePhone("123", "Paraguay")).toBeNull();
    expect(normalizePhone("llamar 0981123456", "Paraguay")).toBeNull();
    expect(whatsappUrl("0981123456")).toBeUndefined();
    expect(whatsappUrl("+595981123456")).toBe("https://wa.me/595981123456");
  });
});
