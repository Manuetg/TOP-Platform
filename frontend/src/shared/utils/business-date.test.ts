import { describe, expect, it } from "vitest";
import { addCalendarDays, businessDateAt, businessDayInstantRange, businessDayStartInstant, instantIntersectsRange } from "./business-date";

describe("fechas puras e instantes IANA del Business", () => {
  it("obtiene la fecha de Asunción aunque UTC ya sea el día siguiente", () => {
    expect(businessDateAt(new Date("2026-09-24T02:30:00Z"), "America/Asuncion")).toBe("2026-09-23");
    expect(businessDateAt(new Date("2026-09-24T02:30:00Z"), "Asia/Tokyo")).toBe("2026-09-24");
  });
  it("convierte los límites de septiembre local sin recortar su última noche", () => {
    expect(businessDayStartInstant("2026-09-01", "America/Asuncion")).toBe("2026-09-01T03:00:00.000Z");
    expect(businessDayStartInstant("2026-10-01", "America/Asuncion")).toBe("2026-10-01T03:00:00.000Z");
    const day = businessDayInstantRange("2026-09-30", "America/Asuncion");
    expect(instantIntersectsRange("2026-10-01T02:30:00Z", "2026-10-01T02:45:00Z", day)).toBe(true);
    expect(instantIntersectsRange("2026-10-01T03:00:00Z", "2026-10-01T04:00:00Z", day)).toBe(false);
    expect(instantIntersectsRange("2026-09-30T02:00:00Z", "2026-09-30T03:00:00Z", day)).toBe(false);
  });
  it.each([
    ["2026-03-08", "America/New_York", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"],
    ["2026-11-01", "America/New_York", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
    ["2018-11-04", "America/Sao_Paulo", "2018-11-04T03:00:00.000Z", "2018-11-05T02:00:00.000Z"],
    ["2020-11-01", "America/Havana", "2020-11-01T04:00:00.000Z", "2020-11-02T05:00:00.000Z"],
    ["2026-09-30", "Asia/Kathmandu", "2026-09-29T18:15:00.000Z", "2026-09-30T18:15:00.000Z"],
  ])("%s en %s usa límites reales (incluye DST y medianoche ausente/repetida)", (date, zone, start, end) => {
    expect(businessDayInstantRange(date, zone)).toEqual({ start, end });
  });
  it("suma fechas puras sin depender de la duración del día comercial", () => {
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-09-30", 1)).toBe("2026-10-01");
  });
  it("rechaza fechas o zonas inválidas sin asumir UTC", () => {
    expect(() => businessDayStartInstant("2026-02-30", "America/Asuncion")).toThrow(RangeError);
    expect(() => businessDayStartInstant("2026-09-30", "Invalid/Zone")).toThrow(RangeError);
  });
});
