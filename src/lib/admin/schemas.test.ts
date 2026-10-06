import { describe, expect, it } from "vitest";
import { agendaParamsSchema, blockSchema, scheduleSlotSchema, serviceSchema } from "./schemas";

const BARBER = "00000000-0000-4000-8000-000000000010";

describe("serviceSchema", () => {
  it("acepta un servicio válido y convierte los números", () => {
    expect(serviceSchema.parse({ name: " Corte ", duration_minutes: "30", price: "25000" })).toEqual({
      name: "Corte",
      duration_minutes: 30,
      price: 25000,
    });
  });

  it("no convierte un precio vacío en 0", () => {
    expect(serviceSchema.safeParse({ name: "Corte", duration_minutes: "30", price: "" }).success).toBe(false);
  });

  it("rechaza duración fuera de rango y precio negativo o con decimales", () => {
    expect(serviceSchema.safeParse({ name: "Corte", duration_minutes: "0", price: "1" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "Corte", duration_minutes: "481", price: "1" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "Corte", duration_minutes: "30", price: "-1" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "Corte", duration_minutes: "30", price: "1.5" }).success).toBe(false);
  });

  it("rechaza nombre vacío", () => {
    expect(serviceSchema.safeParse({ name: "  ", duration_minutes: "30", price: "1" }).success).toBe(false);
  });
});

describe("scheduleSlotSchema", () => {
  it("acepta un tramo válido", () => {
    expect(
      scheduleSlotSchema.safeParse({ barber_id: BARBER, weekday: "1", start_time: "09:00", end_time: "13:00" })
        .success,
    ).toBe(true);
  });

  it("rechaza fin anterior o igual al inicio y día fuera de 1–7", () => {
    expect(
      scheduleSlotSchema.safeParse({ barber_id: BARBER, weekday: "1", start_time: "13:00", end_time: "09:00" })
        .success,
    ).toBe(false);
    expect(
      scheduleSlotSchema.safeParse({ barber_id: BARBER, weekday: "8", start_time: "09:00", end_time: "13:00" })
        .success,
    ).toBe(false);
  });
});

describe("blockSchema", () => {
  it("rechaza un bloqueo que termina antes de empezar", () => {
    expect(
      blockSchema.safeParse({ barber_id: BARBER, starts_at: "2026-10-13T12:00", ends_at: "2026-10-13T10:00" })
        .success,
    ).toBe(false);
  });
});

describe("agendaParamsSchema", () => {
  it("acepta un día real y un barbero válido", () => {
    expect(agendaParamsSchema.parse({ dia: "2026-10-13", barbero: BARBER })).toEqual({ dia: "2026-10-13", barbero: BARBER });
  });

  it("sin parámetros: ambos indefinidos", () => {
    expect(agendaParamsSchema.parse({})).toEqual({ dia: undefined, barbero: undefined });
  });

  it("ignora valores inválidos en lugar de fallar", () => {
    for (const dia of ["2026-02-30", "mañana", "<script>", "2026-13-01", "2026-1-1"]) {
      expect(agendaParamsSchema.parse({ dia })).toEqual({ dia: undefined, barbero: undefined });
    }
    expect(agendaParamsSchema.parse({ barbero: "no-es-uuid" })).toEqual({ dia: undefined, barbero: undefined });
  });
});
