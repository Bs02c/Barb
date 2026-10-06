import { describe, expect, it } from "vitest";
import { createZoneConverter, formatPrice, formatTimeOfDay, localDateTimeToUtc, utcToLocalDateTime } from "./time";

describe("zona horaria de la barbería", () => {
  it("10:00 en Bogotá es 15:00 UTC (spec 001, historia 3)", () => {
    expect(localDateTimeToUtc("2026-10-13T10:00", "America/Bogota").toISOString()).toBe(
      "2026-10-13T15:00:00.000Z",
    );
  });

  it("ida y vuelta conserva la hora local", () => {
    const utc = localDateTimeToUtc("2026-12-31T23:30", "America/Bogota");
    expect(utcToLocalDateTime(utc, "America/Bogota")).toBe("2026-12-31T23:30");
  });

  it("respeta el cambio de horario de zonas que lo tienen", () => {
    // Madrid: invierno UTC+1, verano UTC+2.
    expect(localDateTimeToUtc("2026-01-15T10:00", "Europe/Madrid").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(localDateTimeToUtc("2026-07-15T10:00", "Europe/Madrid").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("rechaza formatos inválidos", () => {
    expect(() => localDateTimeToUtc("13/10/2026 10:00", "America/Bogota")).toThrow();
  });
});

describe("formatos en español de Colombia", () => {
  it("hora de un tramo semanal", () => {
    expect(formatTimeOfDay("09:00:00")).toMatch(/^9:00\sa\.\s?m\.$/);
    expect(formatTimeOfDay("18:30:00")).toMatch(/^6:30\sp\.\s?m\.$/);
  });

  it("precio en pesos sin decimales", () => {
    expect(formatPrice(25000).replace(/\s/g, " ")).toBe("$ 25.000");
  });
});

describe("createZoneConverter", () => {
  it("da lo mismo que las funciones exactas en una ventana sin cambio de horario", () => {
    const c = createZoneConverter("America/Bogota", new Date("2026-10-01T00:00Z"), new Date("2026-11-02T00:00Z"));
    expect(c.localToUtcMs("2026-10-13T10:00")).toBe(localDateTimeToUtc("2026-10-13T10:00", "America/Bogota").getTime());
    expect(c.toLocalDate(new Date("2026-10-14T00:30:00Z"))).toBe("2026-10-13"); // 19:30 del 13 en Bogotá
  });

  it("sigue siendo exacto en una ventana que cruza un cambio de horario", () => {
    // Madrid pasa de verano (UTC+2) a invierno (UTC+1) el 25 de octubre de 2026.
    const c = createZoneConverter("Europe/Madrid", new Date("2026-10-10T00:00Z"), new Date("2026-11-10T00:00Z"));
    expect(new Date(c.localToUtcMs("2026-10-20T10:00")).toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(new Date(c.localToUtcMs("2026-10-30T10:00")).toISOString()).toBe("2026-10-30T09:00:00.000Z");
  });
});
