import { describe, expect, it } from "vitest";
import { localDateTimeToUtc } from "@/lib/time";
import { dayRangeUtc } from "./agenda";

describe("dayRangeUtc", () => {
  it("un día local de Bogotá (UTC-5) va de las 05:00 UTC a las 05:00 UTC del día siguiente", () => {
    expect(dayRangeUtc("2026-10-13", "America/Bogota")).toEqual({
      start: "2026-10-13T05:00:00.000Z",
      end: "2026-10-14T05:00:00.000Z",
    });
  });

  it("una cita a las 23:30 locales cae dentro del día local y no del siguiente", () => {
    const { start, end } = dayRangeUtc("2026-10-13", "America/Bogota");
    const lateNight = localDateTimeToUtc("2026-10-13T23:30", "America/Bogota").toISOString();
    expect(lateNight >= start && lateNight < end).toBe(true); // 04:30 UTC del día 14, pero día local 13
    const nextDayMorning = localDateTimeToUtc("2026-10-14T00:00", "America/Bogota").toISOString();
    expect(nextDayMorning >= end).toBe(true);
  });

  it("el fin de un día es el inicio del siguiente (sin huecos ni solapes)", () => {
    expect(dayRangeUtc("2026-10-13", "America/Bogota").end).toBe(dayRangeUtc("2026-10-14", "America/Bogota").start);
  });
});
