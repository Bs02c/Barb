import { describe, expect, it } from "vitest";
import { computeAvailableSlots, type AvailabilityInput } from "./availability";
import { localDateTimeToUtc } from "@/lib/time";

const TZ = "America/Bogota";
const MONDAY = "2026-10-12"; // lunes
const at = (local: string) => localDateTimeToUtc(local, TZ);
const range = (from: string, to: string) => ({ start: at(from), end: at(to) });
const labels = (input: AvailabilityInput) => computeAvailableSlots(input).map((s) => s.label.replace(/\s/g, " "));

const ANDRES = { id: "a", name: "Andrés" };
const CAMILO = { id: "c", name: "Camilo" };

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    now: at(`${MONDAY}T08:00`),
    durationMinutes: 45,
    barbers: [ANDRES],
    schedules: [{ barberId: "a", weekday: 1, startTime: "09:00:00", endTime: "13:00:00" }],
    blocks: [],
    appointments: [],
    fromDate: MONDAY,
    days: 1,
    ...overrides,
  };
}

describe("computeAvailableSlots", () => {
  it("ofrece inicios cada 15 min en los que cabe el servicio completo", () => {
    const result = labels(base());
    expect(result[0]).toMatch(/^9:00 a\. ?m\.$/);
    expect(result.at(-1)).toMatch(/^12:15 p\. ?m\.$/); // 12:15 + 45 min = 13:00, fin del tramo
    expect(result).toHaveLength(14); // 9:00 … 12:15
  });

  it("exige al menos 1 hora de antelación", () => {
    const result = labels(base({ now: at(`${MONDAY}T09:20`) })); // primer inicio posible: 10:20
    expect(result[0]).toMatch(/^10:30 a\. ?m\.$/);
  });

  it("no ofrece horas que se cruzan con una cita, pero sí las contiguas", () => {
    const slots = computeAvailableSlots(
      base({ appointments: [{ barberId: "a", range: range(`${MONDAY}T10:00`, `${MONDAY}T10:45`) }] }),
    ).map((s) => s.startsAt);
    expect(slots).toContain(at(`${MONDAY}T09:15`).toISOString()); // termina justo a las 10:00
    expect(slots).not.toContain(at(`${MONDAY}T09:30`).toISOString());
    expect(slots).not.toContain(at(`${MONDAY}T10:30`).toISOString());
    expect(slots).toContain(at(`${MONDAY}T10:45`).toISOString()); // empieza justo a las 10:45
  });

  it("respeta los bloqueos", () => {
    const slots = computeAvailableSlots(
      base({ blocks: [{ barberId: "a", range: range(`${MONDAY}T11:00`, `${MONDAY}T12:00`) }] }),
    ).map((s) => s.startsAt);
    expect(slots).toContain(at(`${MONDAY}T10:15`).toISOString()); // 10:15–11:00
    expect(slots).not.toContain(at(`${MONDAY}T10:30`).toISOString());
    expect(slots).not.toContain(at(`${MONDAY}T11:45`).toISOString());
    expect(slots).toContain(at(`${MONDAY}T12:00`).toISOString());
  });

  it("las citas y bloqueos de otro barbero no le afectan", () => {
    const result = computeAvailableSlots(
      base({ appointments: [{ barberId: "c", range: range(`${MONDAY}T09:00`, `${MONDAY}T13:00`) }] }),
    );
    expect(result).toHaveLength(14);
  });

  it("no ofrece nada si el servicio no cabe en ningún tramo", () => {
    expect(computeAvailableSlots(base({ durationMinutes: 300 }))).toEqual([]);
  });

  it("no ofrece nada un día sin tramos (domingo)", () => {
    expect(computeAvailableSlots(base({ fromDate: "2026-10-18" }))).toEqual([]);
  });

  it("no ofrece días pasados aunque se pidan", () => {
    const result = computeAvailableSlots(base({ fromDate: "2026-10-05" })); // lunes anterior
    expect(result.every((s) => s.localDate >= MONDAY)).toBe(true);
  });

  it("limita el horizonte a 30 días", () => {
    const allWeek = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      barberId: "a",
      weekday,
      startTime: "09:00:00",
      endTime: "10:00:00",
    }));
    const days = new Set(computeAvailableSlots(base({ schedules: allWeek, days: 40 })).map((s) => s.localDate));
    expect(days.has("2026-11-10")).toBe(true); // hoy + 29
    expect(days.has("2026-11-11")).toBe(false); // hoy + 30: fuera
  });

  it("agrupa por día local aunque en UTC ya sea el día siguiente", () => {
    const slots = computeAvailableSlots(
      base({
        durationMinutes: 30,
        schedules: [{ barberId: "a", weekday: 1, startTime: "19:00:00", endTime: "20:00:00" }],
      }),
    );
    const last = slots.at(-1)!;
    expect(last.startsAt).toBe("2026-10-13T00:30:00.000Z"); // 19:30 en Bogotá
    expect(last.localDate).toBe(MONDAY);
    expect(last.label.replace(/\s/g, " ")).toMatch(/^7:30 p\. ?m\.$/);
  });

  describe("Lo más pronto (varios barberos)", () => {
    const both = {
      barbers: [CAMILO, ANDRES],
      schedules: [
        { barberId: "a", weekday: 1, startTime: "09:00:00", endTime: "13:00:00" },
        { barberId: "c", weekday: 1, startTime: "09:00:00", endTime: "13:00:00" },
      ],
    };

    it("una hora libre para varios aparece una sola vez", () => {
      expect(computeAvailableSlots(base(both))).toHaveLength(14);
    });

    it("a igual carga, asigna por nombre", () => {
      expect(computeAvailableSlots(base(both))[0].barberId).toBe("a"); // Andrés antes que Camilo
    });

    it("asigna al barbero con menos citas ese día", () => {
      const slots = computeAvailableSlots(
        base({ ...both, appointments: [{ barberId: "a", range: range(`${MONDAY}T12:00`, `${MONDAY}T12:45`) }] }),
      );
      expect(slots[0].barberId).toBe("c");
    });

    it("si solo uno está libre a esa hora, lo asigna a él", () => {
      const slots = computeAvailableSlots(
        base({ ...both, appointments: [{ barberId: "c", range: range(`${MONDAY}T09:00`, `${MONDAY}T09:45`) }] }),
      );
      expect(slots.find((s) => s.startsAt === at(`${MONDAY}T09:00`).toISOString())?.barberId).toBe("a");
    });
  });
});

describe("rendimiento (revisión fase 4, PERF-001)", () => {
  it("calcula 30 días para 5 barberos con 200 citas en pocos milisegundos", () => {
    const barbers = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, name: `Barbero ${i}` }));
    const schedules = barbers.flatMap((b) =>
      [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { barberId: b.id, weekday, startTime: "09:00:00", endTime: "13:00:00" },
        { barberId: b.id, weekday, startTime: "14:00:00", endTime: "19:00:00" },
      ]),
    );
    const appointments = Array.from({ length: 200 }, (_, i) => {
      const start = at(`2026-10-${String(13 + (i % 18)).padStart(2, "0")}T10:00`);
      return { barberId: barbers[i % 5].id, range: { start, end: new Date(start.getTime() + 30 * 60_000) } };
    });
    const input = base({ barbers, schedules, appointments, durationMinutes: 30, days: undefined });

    computeAvailableSlots(input); // calentamiento
    const runs = 5;
    const start = performance.now();
    for (let i = 0; i < runs; i++) computeAvailableSlots(input);
    const perRun = (performance.now() - start) / runs;

    // Antes de la corrección: ~225 ms. Margen amplio para máquinas lentas o CI.
    expect(perRun).toBeLessThan(25);
  });
});
