import { describe, expect, it } from "vitest";
import { agendaParamsSchema, barbershopInfoSchema, blockSchema, scheduleSlotSchema, serviceSchema } from "./schemas";

const BARBER = "00000000-0000-4000-8000-000000000010";

describe("barbershopInfoSchema (spec 006)", () => {
  it("recorta espacios y convierte lo vacío en null", () => {
    expect(barbershopInfoSchema.parse({ description: "  Cortes clásicos.  ", address: "" })).toEqual({
      description: "Cortes clásicos.",
      address: null,
    });
    expect(barbershopInfoSchema.parse({})).toEqual({ description: null, address: null });
  });

  it("límites: 160 para la descripción y 200 para la dirección", () => {
    expect(barbershopInfoSchema.safeParse({ description: "a".repeat(160) }).success).toBe(true);
    const tooLong = barbershopInfoSchema.safeParse({ description: "a".repeat(161), address: "b".repeat(201) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ["description", "Máximo 160 caracteres."],
      ["address", "Máximo 200 caracteres."],
    ]);
  });

  it("rechaza saltos de línea en medio del texto, también los de Unicode", () => {
    for (const address of ["Calle 45\n# 12-30", "Calle 45\u2028# 12-30"]) {
      const result = barbershopInfoSchema.safeParse({ address });
      expect(result.error?.issues.map((i) => i.message)).toEqual(["Escríbelo en una sola línea."]);
    }
  });

  it("rechaza caracteres de control y marcas bidi invisibles (SEC-001)", () => {
    for (const address of ["Calle\t45", "Calle 45\u202E03-21 #", "Calle\u200B45", "Calle\u000745"]) {
      const result = barbershopInfoSchema.safeParse({ address });
      expect(result.error?.issues.map((i) => i.message)).toEqual(["Quita los caracteres especiales invisibles."]);
    }
    expect(barbershopInfoSchema.parse({ description: "Barbería «El Corte» — cortes y barba ✂️" }).description).toBe(
      "Barbería «El Corte» — cortes y barba ✂️",
    );
  });
});

describe("serviceSchema", () => {
  it("acepta un servicio válido y convierte los números", () => {
    expect(serviceSchema.parse({ name: " Corte ", duration_minutes: "30", price: "25000" })).toEqual({
      name: "Corte",
      duration_minutes: 30,
      price: 25000,
      description: null,
    });
  });

  it("descripción opcional: recorta espacios y vacía es null (spec 006)", () => {
    const base = { name: "Corte", duration_minutes: "30", price: "1" };
    expect(serviceSchema.parse({ ...base, description: "  Con lavado.  " }).description).toBe("Con lavado.");
    expect(serviceSchema.parse({ ...base, description: "   " }).description).toBeNull();
    expect(serviceSchema.safeParse({ ...base, description: "a".repeat(201) }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...base, description: "a".repeat(200) }).success).toBe(true);
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
