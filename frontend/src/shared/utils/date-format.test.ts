import { describe, expect, it } from "vitest";
import { formatBusinessInstant, formatPureDate } from "./date-format";

describe("presentación de fechas", () => {
  it("conserva fechas gregorianas y bisiestos sin conversión de timezone", () => {
    expect(formatPureDate("2026-09-24")).toBe("24/09/2026");
    expect(formatPureDate("2024-02-29")).toBe("29/02/2024");
    expect(formatPureDate("2000-02-29")).toBe("29/02/2000");
    for (const date of ["1900-02-29", "2026-02-29", "2026-04-31", "2026-00-01", "2026-01-00", "0000-01-01"]) expect(formatPureDate(date)).toBe("Sin fecha");
  });
  it("maneja null y no confunde instantes con fechas", () => {
    expect(formatPureDate(null)).toBe("Sin fecha");
    expect(formatPureDate(undefined, "Sin definir")).toBe("Sin definir");
    expect(formatPureDate("2026-09-24T00:00:00Z")).toBe("Sin fecha");
    expect(formatBusinessInstant("2026-09-24", "America/Asuncion")).toBe("Sin fecha");
    expect(formatBusinessInstant(null, "UTC")).toBe("Sin fecha");
    expect(formatBusinessInstant("2026-99-99T00:00:00Z", "UTC")).toBe("Sin fecha");
  });
  it("presenta instantes en el día y hora del Business, incluido DST", () => {
    expect(formatBusinessInstant("2026-09-24T01:30:00Z", "America/Asuncion")).toBe("23/09/2026, 22:30");
    expect(formatBusinessInstant("2026-09-24T01:30:00Z", "UTC")).toBe("24/09/2026, 01:30");
    expect(formatBusinessInstant("2026-03-08T06:30:00Z", "America/New_York")).toBe("08/03/2026, 01:30");
    expect(formatBusinessInstant("2026-03-08T07:30:00Z", "America/New_York")).toBe("08/03/2026, 03:30");
  });
});
