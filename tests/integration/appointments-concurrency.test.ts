import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withService } from "@/lib/db/client";
import { toDbError } from "@/lib/db/errors";
import { appointments } from "@/lib/db/schema";
import { deleteBarbershop, insert } from "./helpers/db";

// SC-002: dos reservas concurrentes del mismo hueco → exactamente una se acepta.
// pgTAP no puede probarlo porque corre en una sola sesión; aquí son dos transacciones
// independientes contra la base local, con withService (como hace la reserva pública).
// El test verifica el resultado; que nunca pasen las dos lo garantiza la restricción de
// exclusión de Postgres aunque las transacciones se solapen (research §4).
// Datos de preparación como db_owner (helpers/db.ts, solo base local).

let barbershopId: string;
let barberId: string;
let serviceId: string;

beforeAll(async () => {
  barbershopId = (await insert<{ id: string }>("barbershops", { name: "Test concurrencia", subdomain: `test-${randomUUID().slice(0, 8)}` })).id;
  barberId = (await insert<{ id: string }>("barbers", { barbershop_id: barbershopId, name: "Barbero test" })).id;
  serviceId = (
    await insert<{ id: string }>("services", { barbershop_id: barbershopId, name: "Corte", duration_minutes: 30, price: 25000 })
  ).id;
});

afterAll(async () => {
  // Borrar la barbería borra en cascada todo lo creado por el test.
  await deleteBarbershop(barbershopId);
});

/** Reserva el mismo hueco; devuelve el código de error de Postgres o null si se aceptó. */
async function bookSameSlot(customerName: string): Promise<string | null> {
  try {
    await withService((tx) =>
      tx.insert(appointments).values({
        barbershopId,
        barberId,
        serviceId,
        startsAt: new Date("2030-01-07T15:00:00Z"),
        endsAt: new Date("2030-01-07T15:30:00Z"),
        serviceDurationMinutes: 30,
        servicePrice: "25000",
        customerName,
        customerPhone: "+573001234567",
        customerEmail: "cliente@example.com",
        dataConsentAt: new Date(),
      }),
    );
    return null;
  } catch (error) {
    return toDbError(error)?.code ?? "desconocido";
  }
}

describe("reservas concurrentes del mismo hueco", () => {
  it("acepta exactamente una y rechaza la otra por solapamiento", async () => {
    const results = await Promise.all([bookSameSlot("Cliente A"), bookSameSlot("Cliente B")]);

    const accepted = results.filter((code) => code === null);
    const rejected = results.filter((code) => code !== null);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // 23P01 (exclusion_violation) si la segunda llega cuando la primera ya confirmó.
    // 40P01 (deadlock_detected) si las dos transacciones se solapan de verdad: cada una
    // espera a la otra para comprobar la exclusión y Postgres aborta una. La integridad
    // se mantiene en ambos casos; la reserva (fase 4) reintenta una vez ante 40P01.
    expect(["23P01", "40P01"]).toContain(rejected[0]);
  });
});
