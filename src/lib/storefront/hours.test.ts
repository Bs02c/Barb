import { describe, expect, it } from "vitest";
import { formatTimeOfDay } from "@/lib/time";
import { mapsSearchUrl, openingStatus, todayWeekday, weeklyHours } from "./hours";

// Horario y estado de apertura de la portada (spec 006, SC-006). 2026-10-14 es miércoles (3).
// Bogotá es UTC-5 todo el año: 15:00 UTC = 10:00 en Bogotá.
const BOGOTA = "America/Bogota";
const at = (iso: string) => new Date(iso);
const t = (time: string) => formatTimeOfDay(time); // "9:00 a. m." con los espacios de Intl

describe("weeklyHours", () => {
  it("devuelve los siete días, con null en los que no abre", () => {
    const hours = weeklyHours([{ weekday: 1, startTime: "09:00:00", endTime: "18:00:00" }]);
    expect(hours.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hours[0]).toMatchObject({ label: "Lunes", open: "09:00", close: "18:00" });
    expect(hours[1]).toMatchObject({ open: null, close: null, openLabel: null, closeLabel: null });
  });

  it("une los tramos de varios barberos: apertura más temprana y cierre más tardío", () => {
    const hours = weeklyHours([
      { weekday: 3, startTime: "09:00:00", endTime: "12:00:00" },
      { weekday: 3, startTime: "14:00:00", endTime: "19:00:00" },
      { weekday: 3, startTime: "10:00:00", endTime: "13:00:00" },
    ]);
    expect(hours[2]).toMatchObject({ open: "09:00", close: "19:00", openLabel: t("09:00"), closeLabel: t("19:00") });
  });

  it("sin tramos, todos los días cerrados", () => {
    expect(weeklyHours([]).every((d) => d.open === null)).toBe(true);
  });
});

describe("openingStatus", () => {
  const weekdays = weeklyHours(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00:00", endTime: "19:00:00" })),
  );

  it("dentro del horario: abierto hasta la hora de cierre", () => {
    expect(openingStatus(weekdays, at("2026-10-14T20:00:00Z"), BOGOTA)).toEqual({
      kind: "open",
      text: `Abierto ahora · hasta ${t("19:00")}`,
    });
  });

  it("a la hora de apertura ya está abierto", () => {
    expect(openingStatus(weekdays, at("2026-10-14T14:00:00Z"), BOGOTA).kind).toBe("open");
  });

  it("antes de abrir: abre hoy", () => {
    expect(openingStatus(weekdays, at("2026-10-14T12:30:00Z"), BOGOTA)).toEqual({
      kind: "opensToday",
      text: `Abre hoy a las ${t("09:00")}`,
    });
  });

  it("a la hora exacta de cierre ya está cerrado y abre mañana", () => {
    expect(openingStatus(weekdays, at("2026-10-15T00:00:00Z"), BOGOTA)).toEqual({
      kind: "closed",
      text: `Cerrado ahora · Abre mañana a las ${t("09:00")}`,
    });
  });

  it("usa el día de la barbería, no el de UTC: 22:00 del miércoles en Bogotá ya es jueves en UTC", () => {
    const onlyWednesday = weeklyHours([{ weekday: 3, startTime: "09:00:00", endTime: "23:00:00" }]);
    expect(openingStatus(onlyWednesday, at("2026-10-15T03:00:00Z"), BOGOTA).kind).toBe("open");
  });

  it("sábado después de cerrar: abre el lunes, con el nombre del día", () => {
    // 2026-10-17 es sábado; 20:00 en Bogotá = 01:00 UTC del domingo.
    expect(openingStatus(weekdays, at("2026-10-18T01:00:00Z"), BOGOTA).text).toBe(
      `Cerrado ahora · Abre lunes a las ${t("09:00")}`,
    );
  });

  it("domingo (sin horario): abre mañana lunes", () => {
    expect(openingStatus(weekdays, at("2026-10-18T15:00:00Z"), BOGOTA).text).toBe(
      `Cerrado ahora · Abre mañana a las ${t("09:00")}`,
    );
  });

  it("si solo abre un día y ya cerró, el próximo es ese mismo día de la semana siguiente", () => {
    const onlyWednesday = weeklyHours([{ weekday: 3, startTime: "09:00:00", endTime: "12:00:00" }]);
    expect(openingStatus(onlyWednesday, at("2026-10-14T20:00:00Z"), BOGOTA).text).toBe(
      `Cerrado ahora · Abre miércoles a las ${t("09:00")}`,
    );
  });

  it("sin ningún horario: solo «Cerrado ahora»", () => {
    expect(openingStatus(weeklyHours([]), at("2026-10-14T20:00:00Z"), BOGOTA)).toEqual({
      kind: "closed",
      text: "Cerrado ahora",
    });
  });

  it("respeta zonas con horario de verano", () => {
    // Madrid en octubre de 2026 es UTC+2 hasta el 25; 07:30 UTC = 09:30 locales.
    expect(openingStatus(weekdays, at("2026-10-14T07:30:00Z"), "Europe/Madrid").kind).toBe("open");
    // Tras el cambio (UTC+1): 07:30 UTC = 08:30 locales, aún no abre.
    expect(openingStatus(weekdays, at("2026-10-28T07:30:00Z"), "Europe/Madrid").kind).toBe("opensToday");
  });
});

describe("todayWeekday", () => {
  it("es el día de la semana en la zona de la barbería", () => {
    expect(todayWeekday(at("2026-10-15T03:00:00Z"), BOGOTA)).toBe(3); // miércoles en Bogotá
    expect(todayWeekday(at("2026-10-15T15:00:00Z"), BOGOTA)).toBe(4);
  });
});

describe("mapsSearchUrl", () => {
  it("codifica #, tildes y espacios de la dirección", () => {
    expect(mapsSearchUrl("Calle 45 # 12-30, Bogotá")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Calle%2045%20%23%2012-30%2C%20Bogot%C3%A1",
    );
  });
});
