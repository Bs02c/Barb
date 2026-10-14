import { describe, expect, it } from "vitest";
import { HORIZON_DAYS } from "./availability";
import { bookingCalendar, groupByPeriod, pickPeriod } from "./calendar";

// Paso 3 de la reserva: carrusel de fechas y franjas. Bogotá es UTC-5: 14:00 UTC = 9:00 locales.
const BOGOTA = "America/Bogota";
const slot = (iso: string) => ({ startsAt: iso });

describe("bookingCalendar", () => {
  it("devuelve los días del horizonte desde hoy, con los sin horas marcados como no disponibles", () => {
    const days = bookingCalendar("2026-10-15", new Set(["2026-10-15", "2026-10-17"]));
    expect(days).toHaveLength(HORIZON_DAYS);
    expect(days[0]).toEqual({ localDate: "2026-10-15", weekday: "jue", day: "15", month: "oct", isToday: true, available: true });
    expect(days[1]).toMatchObject({ localDate: "2026-10-16", weekday: "vie", isToday: false, available: false });
    expect(days[2].available).toBe(true);
    expect(days.at(-1)?.localDate).toBe("2026-11-13");
  });

  it("cruza el cambio de mes", () => {
    const days = bookingCalendar("2026-10-30", new Set());
    expect(days.slice(0, 3).map((d) => `${d.day} ${d.month}`)).toEqual(["30 oct", "31 oct", "1 nov"]);
  });
});

describe("groupByPeriod", () => {
  it("reparte por hora local: Mañana < 12:00 ≤ Tarde < 18:00 ≤ Noche", () => {
    const slots = [
      slot("2026-10-15T14:00:00Z"), // 9:00
      slot("2026-10-15T16:45:00Z"), // 11:45
      slot("2026-10-15T17:00:00Z"), // 12:00 → Tarde
      slot("2026-10-15T22:45:00Z"), // 17:45
      slot("2026-10-15T23:00:00Z"), // 18:00 → Noche
      slot("2026-10-16T01:30:00Z"), // 20:30 del 15 en Bogotá
    ];
    const periods = groupByPeriod(slots, BOGOTA);
    expect(periods.map((p) => [p.label, p.slots.length])).toEqual([
      ["Mañana", 2],
      ["Tarde", 2],
      ["Noche", 2],
    ]);
  });

  it("siempre devuelve las tres franjas, aunque estén vacías", () => {
    expect(groupByPeriod([], BOGOTA).map((p) => p.id)).toEqual(["manana", "tarde", "noche"]);
  });
});

describe("pickPeriod", () => {
  const periods = groupByPeriod([slot("2026-10-15T19:00:00Z"), slot("2026-10-15T23:30:00Z")], BOGOTA); // tarde y noche

  it("abre la pedida si tiene horas", () => {
    expect(pickPeriod(periods, "noche")?.id).toBe("noche");
  });

  it("si la pedida no tiene horas o no existe, abre la primera con horas", () => {
    expect(pickPeriod(periods, "manana")?.id).toBe("tarde");
    expect(pickPeriod(periods, "basura")?.id).toBe("tarde");
    expect(pickPeriod(periods, undefined)?.id).toBe("tarde");
  });

  it("sin horas en el día: ninguna", () => {
    expect(pickPeriod(groupByPeriod([], BOGOTA), undefined)).toBeUndefined();
  });
});
