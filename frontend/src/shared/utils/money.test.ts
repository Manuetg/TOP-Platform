import { describe, expect, it } from "vitest";
import { formatMoney, parseGuaranies } from "./money";

describe("contrato de unidades menores y presentación monetaria", () => {
  it.each([0, 1, 450000, 600000])("PYG %s no multiplica ni divide por cien", (amount) => {
    expect(formatMoney(amount, "PYG")).toBe(`₲ ${new Intl.NumberFormat("es-PY").format(amount)}`);
  });
  it.each(["450000", "450.000"])("restaura y envía %s sin cambiar escala", (input) => {
    expect(parseGuaranies(input)).toBe(450000);
    expect(parseGuaranies(new Intl.NumberFormat("es-PY").format(450000))).toBe(450000);
  });
  it.each(["", " ", "0", "-1", "1,50", "1.50", "NaN", "1e5", "9007199254740992"])("rechaza %s sin redondear o truncar", (input) => expect(parseGuaranies(input)).toBeNull());
  it("solo admite cero cuando el flujo permite importe acordado cero", () => expect(parseGuaranies("0", true)).toBe(0));
  it("el formato no aplica una escala universal a otras monedas", () => expect(formatMoney(12345, "USD")).toContain("123,45"));
});
