import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicBarbershop } from "@/lib/barbershops";
import { bookAppointment } from "@/lib/booking/book";
import { toDbError } from "@/lib/db/errors";
import { localDateTimeToUtc } from "@/lib/time";
import { deleteBarbershop, insert, ownerDb } from "./helpers/db";

// Test obligatorio 7 del ADR-017: con una transacción que retiene el candado del tope por teléfono
// (trigger appointments_phone_limit), otra reserva del mismo número no se queda colgada: falla por
// lock_timeout (5 s en el rol app_login) y la server action responde "error del servidor".
// Antes lo daba Supabase por rol; ahora lo fija db/init/roles.sh (spec 005, research §9).

const TZ = "America/Bogota";
const NOW = localDateTimeToUtc("2030-01-07T08:00", TZ);
const PHONE = "+573009998877";
let shop: PublicBarbershop;
let barberId: string;
let serviceId: string;

beforeAll(async () => {
  shop = await insert<PublicBarbershop>("barbershops", { name: "Test candado", subdomain: `test-lock-${randomUUID().slice(0, 8)}`, timezone: TZ });
  barberId = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Barbero" })).id;
  serviceId = (await insert<{ id: string }>("services", { barbershop_id: shop.id, name: "Corte", duration_minutes: 30, price: 1000 })).id;
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: barberId, weekday: 2, start_time: "09:00", end_time: "13:00" });
});

afterAll(async () => {
  await deleteBarbershop(shop?.id);
});

describe("tiempo máximo con el candado del tope por teléfono retenido", () => {
  it("la segunda reserva falla en menos de 6 s por lock_timeout", async () => {
    const holder = await ownerDb.connect();
    try {
      await holder.query("begin");
      // Mismo candado que toma el trigger: hashtextextended('<barbería>:<teléfono>', 0).
      await holder.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${shop.id}:${PHONE}`]);

      const started = Date.now();
      const attempt = bookAppointment(
        shop,
        {
          service_id: serviceId,
          barber_id: barberId,
          starts_at: localDateTimeToUtc("2030-01-08T09:00", TZ).toISOString(),
          customer_name: "Cliente",
          customer_phone: PHONE,
          customer_email: "cliente@example.com",
          consent: "on",
        },
        NOW,
      );
      const error = await attempt.then(
        () => null,
        (e: unknown) => e,
      );
      const elapsed = Date.now() - started;

      expect(toDbError(error)?.code).toBe("55P03"); // lock_not_available: lo convierte en server_error submit.ts
      expect(elapsed).toBeLessThan(6_000);
    } finally {
      await holder.query("rollback");
      holder.release();
    }
  }, 15_000);
});
