import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicBarbershop } from "@/lib/barbershops";
import { bookAppointment } from "@/lib/booking/book";
import type { BookingInput } from "@/lib/booking/schemas";
import { submitCancellation } from "@/lib/cancellation/cancel";
import { getCancellation } from "@/lib/cancellation/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateTimeToUtc } from "@/lib/time";

// Cancelación con enlace (spec 003: historia 2, FR-005 a FR-008). Crea dos barberías de prueba
// propias y las borra al terminar. Cada test usa su propio día para poder ejecutarse solo.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local"); // ADR-014
}

const db = createServiceClient();
const TZ = "America/Bogota";
const NOW = localDateTimeToUtc("2030-01-07T08:00", TZ);
const at = (local: string) => localDateTimeToUtc(local, TZ).toISOString();
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

let shop: PublicBarbershop;
let otherShop: PublicBarbershop;
let barber: string;
let otherBarber: string;
let service: string;
let otherService: string;

async function insert<T>(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table as "barbers").insert(row as never).select("*").single();
  if (error) throw error;
  return data as T;
}

const host = (s: PublicBarbershop) => `${s.subdomain}.${ROOT}`;

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  shop = await insert<PublicBarbershop>("barbershops", { name: "Test cancelar", subdomain: `test-cancel-${suffix}`, timezone: TZ });
  otherShop = await insert<PublicBarbershop>("barbershops", { name: "Test otra", subdomain: `test-canc-otra-${suffix}`, timezone: TZ });
  barber = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Andrés" })).id;
  otherBarber = (await insert<{ id: string }>("barbers", { barbershop_id: otherShop.id, name: "Otro" })).id;
  service = (await insert<{ id: string }>("services", { barbershop_id: shop.id, name: "Corte", duration_minutes: 45, price: 25000 })).id;
  otherService = (await insert<{ id: string }>("services", { barbershop_id: otherShop.id, name: "Corte", duration_minutes: 45, price: 1 })).id;
  for (const [shopId, barberId] of [[shop.id, barber], [otherShop.id, otherBarber]]) {
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await insert("barber_schedules", { barbershop_id: shopId, barber_id: barberId, weekday, start_time: "09:00", end_time: "13:00" });
    }
  }
});

afterAll(async () => {
  // Borrar la barbería borra en cascada barberos, servicios, horarios y citas.
  if (shop) await db.from("barbershops").delete().eq("id", shop.id);
  if (otherShop) await db.from("barbershops").delete().eq("id", otherShop.id);
});

function input(startsAt: string, overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    service_id: service,
    barber_id: barber,
    starts_at: startsAt,
    customer_name: "Cliente de prueba",
    customer_phone: `+57300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    customer_email: "cliente@example.com",
    consent: "on",
    ...overrides,
  };
}

/** Reserva en la barbería de prueba y devuelve el token del enlace del correo. */
async function book(local: string, target: PublicBarbershop = shop) {
  const overrides: Partial<BookingInput> =
    target === shop ? {} : { service_id: otherService, barber_id: otherBarber };
  const { result, confirmation } = await bookAppointment(target, input(at(local), overrides), NOW);
  if (!result.ok || !confirmation) throw new Error("la reserva de preparación falló");
  return confirmation.cancelUrl.split("/cancelar/")[1];
}

async function statusAt(local: string, barberId = barber) {
  const { data, error } = await db.from("appointments").select("status").eq("barber_id", barberId).eq("starts_at", at(local)).single();
  if (error) throw error;
  return data.status;
}

describe("getCancellation (abrir el enlace)", () => {
  it("muestra los datos de la cita y NO la cancela (SC-003)", async () => {
    const token = await book("2030-01-08T09:00");
    const view = await getCancellation(shop, token, NOW);
    expect(view).toMatchObject({
      status: "active",
      details: { serviceName: "Corte", barberName: "Andrés", durationMinutes: 45 },
    });
    expect(JSON.stringify(view)).not.toMatch(/cliente@example\.com|\+57300/); // sin datos del cliente
    expect(await statusAt("2030-01-08T09:00")).toBe("active");
  });
});

describe("barbero o servicio desactivado después de reservar", () => {
  it("el enlace sigue funcionando y muestra los nombres", async () => {
    const extraBarber = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Temporal" })).id;
    const extraService = (await insert<{ id: string }>("services", { barbershop_id: shop.id, name: "Barba", duration_minutes: 30, price: 15000 })).id;
    await insert("barber_schedules", { barbershop_id: shop.id, barber_id: extraBarber, weekday: 3, start_time: "09:00", end_time: "13:00" });
    const { result, confirmation } = await bookAppointment(
      shop,
      input(at("2030-01-16T09:00"), { barber_id: extraBarber, service_id: extraService }),
      NOW,
    );
    expect(result).toMatchObject({ ok: true });
    const token = confirmation!.cancelUrl.split("/cancelar/")[1];

    await db.from("barbers").update({ is_active: false }).eq("id", extraBarber);
    await db.from("services").update({ is_active: false }).eq("id", extraService);

    expect(await getCancellation(shop, token, NOW)).toMatchObject({
      status: "active",
      details: { serviceName: "Barba", barberName: "Temporal" },
    });
    expect(await submitCancellation(host(shop), shop.subdomain, token, NOW)).toEqual({ ok: true });
  });
});

describe("submitCancellation (pulsar el botón)", () => {
  it("cancela, y la hora vuelve a quedar libre", async () => {
    const token = await book("2030-01-09T09:00");
    expect(await submitCancellation(host(shop), shop.subdomain, token, NOW)).toEqual({ ok: true });
    expect(await statusAt("2030-01-09T09:00")).toBe("cancelled");
    const { data } = await db.from("appointments").select("cancelled_at").eq("barber_id", barber).eq("starts_at", at("2030-01-09T09:00")).single();
    expect(data!.cancelled_at).not.toBeNull();

    const again = await bookAppointment(shop, input(at("2030-01-09T09:00")), NOW);
    expect(again.result).toMatchObject({ ok: true }); // hora liberada
  });

  it("una segunda cancelación responde que ya está cancelada", async () => {
    const token = await book("2030-01-10T09:00");
    await submitCancellation(host(shop), shop.subdomain, token, NOW);
    expect(await submitCancellation(host(shop), shop.subdomain, token, NOW)).toMatchObject({ ok: false, code: "already_cancelled" });
    expect(await getCancellation(shop, token, NOW)).toMatchObject({ status: "already_cancelled" });
  });

  it("dos cancelaciones simultáneas: exactamente una ok y la otra ya cancelada", async () => {
    const token = await book("2030-01-11T09:00");
    const results = await Promise.all([
      submitCancellation(host(shop), shop.subdomain, token, NOW),
      submitCancellation(host(shop), shop.subdomain, token, NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: "already_cancelled" });
  });

  it("una cita que ya empezó no se puede cancelar", async () => {
    const token = await book("2030-01-12T09:00");
    const after = new Date(at("2030-01-12T09:30"));
    expect(await getCancellation(shop, token, after)).toMatchObject({ status: "past" });
    expect(await submitCancellation(host(shop), shop.subdomain, token, after)).toMatchObject({ ok: false, code: "past" });
    expect(await statusAt("2030-01-12T09:00")).toBe("active");
  });

  it("token mal formado, inexistente o de otra barbería: inválido y sin cancelar nada", async () => {
    const foreignToken = await book("2030-01-14T09:00", otherShop);
    const unknown = "a".repeat(43);

    expect(await getCancellation(shop, "corto", NOW)).toEqual({ status: "invalid" });
    expect(await getCancellation(shop, unknown, NOW)).toEqual({ status: "invalid" });
    expect(await getCancellation(shop, foreignToken, NOW)).toEqual({ status: "invalid" }); // lectura aislada

    for (const token of ["corto", unknown, foreignToken]) {
      expect(await submitCancellation(host(shop), shop.subdomain, token, NOW)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(await statusAt("2030-01-14T09:00", otherBarber)).toBe("active"); // la de la otra barbería sigue activa
  });

  it("host distinto del subdominio reclamado: inválido y sin cancelar (SEC-001)", async () => {
    const token = await book("2030-01-15T09:00");
    expect(await submitCancellation(host(otherShop), shop.subdomain, token, NOW)).toMatchObject({ ok: false, code: "invalid" });
    expect(await submitCancellation(ROOT, shop.subdomain, token, NOW)).toMatchObject({ ok: false, code: "invalid" });
    expect(await submitCancellation("otro.com", shop.subdomain, token, NOW)).toMatchObject({ ok: false, code: "invalid" });
    expect(await statusAt("2030-01-15T09:00")).toBe("active");
  });
});
