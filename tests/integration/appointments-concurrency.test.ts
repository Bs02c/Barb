import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// SC-002: dos reservas concurrentes del mismo hueco → exactamente una se acepta.
// pgTAP no puede probarlo porque corre en una sola sesión; aquí son dos peticiones
// independientes contra la base local, con la clave secreta (como hará el servidor).
// El test verifica el resultado; que nunca pasen las dos lo garantiza la restricción de
// exclusión de Postgres aunque las transacciones se solapen (research §4).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
if (!url || !LOCAL_HOSTS.has(new URL(url).hostname) || !secretKey) {
  // Nunca contra un entorno remoto (ADR-014).
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local");
}

const db = createClient(url, secretKey, { auth: { persistSession: false } });

let barbershopId: string;
let barberId: string;
let serviceId: string;

beforeAll(async () => {
  const shop = await db
    .from("barbershops")
    .insert({ name: "Test concurrencia", subdomain: `test-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (shop.error) throw shop.error;
  barbershopId = shop.data.id;

  const barber = await db
    .from("barbers")
    .insert({ barbershop_id: barbershopId, name: "Barbero test" })
    .select("id")
    .single();
  if (barber.error) throw barber.error;
  barberId = barber.data.id;

  const service = await db
    .from("services")
    .insert({ barbershop_id: barbershopId, name: "Corte", duration_minutes: 30, price: 25000 })
    .select("id")
    .single();
  if (service.error) throw service.error;
  serviceId = service.data.id;
});

afterAll(async () => {
  // Borrar la barbería borra en cascada todo lo creado por el test.
  if (barbershopId) await db.from("barbershops").delete().eq("id", barbershopId);
});

function bookSameSlot(customerName: string) {
  return db.from("appointments").insert({
    barbershop_id: barbershopId,
    barber_id: barberId,
    service_id: serviceId,
    starts_at: "2030-01-07T15:00:00Z",
    ends_at: "2030-01-07T15:30:00Z",
    service_duration_minutes: 30,
    service_price: 25000,
    customer_name: customerName,
    customer_phone: "+573001234567",
    customer_email: "cliente@example.com",
    data_consent_at: new Date().toISOString(),
  });
}

describe("reservas concurrentes del mismo hueco", () => {
  it("acepta exactamente una y rechaza la otra por solapamiento", async () => {
    const results = await Promise.all([bookSameSlot("Cliente A"), bookSameSlot("Cliente B")]);

    const accepted = results.filter((r) => !r.error);
    const rejected = results.filter((r) => r.error);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // 23P01 (exclusion_violation) si la segunda llega cuando la primera ya confirmó.
    // 40P01 (deadlock_detected) si las dos transacciones se solapan de verdad: cada una
    // espera a la otra para comprobar la exclusión y Postgres aborta una. La integridad
    // se mantiene en ambos casos; la reserva (fase 4) reintenta una vez ante 40P01.
    expect(["23P01", "40P01"]).toContain(rejected[0].error?.code);
  });
});
