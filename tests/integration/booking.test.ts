import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicBarbershop } from "@/lib/barbershops";
import { bookAppointment as bookOutcome } from "@/lib/booking/book";
import { hashToken } from "@/lib/cancellation/token";
import type { BookingInput } from "@/lib/booking/schemas";
import { submitBooking as submitOutcome } from "@/lib/booking/submit";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateTimeToUtc } from "@/lib/time";

// Reglas del servidor de la reserva pública (spec 002: historias 1–5, FR-008 a FR-014).
// Crea dos barberías de prueba propias (no depende del seed) y las borra al terminar.
// Cada test usa su propio día o barbero, así se puede ejecutar solo (revisión fase 4, MAINT-008).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local"); // ADR-014
}

const db = createServiceClient();

// bookResult/submitResult devuelven solo el resultado para el navegador (los tests de reglas);
// bookOutcome/submitOutcome, el outcome completo con los datos del correo (los de la confirmación).
const bookResult = async (...args: Parameters<typeof bookOutcome>) => (await bookOutcome(...args)).result;
const submitResult = async (...args: Parameters<typeof submitOutcome>) => (await submitOutcome(...args)).result;
const TZ = "America/Bogota";
// Lunes 7 de enero de 2030, 8:00 en Bogotá. Las citas de prueba son de 2030 y el trigger del tope usa
// now() real: estos tests dejarán de pasar al llegar 2030 y habrá que mover todas las fechas.
const NOW = localDateTimeToUtc("2030-01-07T08:00", TZ);
const at = (local: string) => localDateTimeToUtc(local, TZ).toISOString();
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

let shop: PublicBarbershop;
let otherShop: PublicBarbershop;
let andres: string;
let camilo: string;
let inactive: string;
let corte: string; // 45 min, $25.000
let otherShopService: string;

async function insert<T>(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table as "barbers").insert(row as never).select("*").single();
  if (error) throw error;
  return data as T;
}

async function activeCount(barberId: string, startsAt: string) {
  const { count, error } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("barber_id", barberId)
    .eq("starts_at", startsAt)
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  shop = await insert<PublicBarbershop>("barbershops", { name: "Test reserva", subdomain: `test-reserva-${suffix}`, timezone: TZ });
  otherShop = await insert<PublicBarbershop>("barbershops", { name: "Test otra", subdomain: `test-otra-${suffix}`, timezone: TZ });

  andres = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Andrés" })).id;
  camilo = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Camilo" })).id;
  inactive = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Inactivo", is_active: false })).id;
  corte = (await insert<{ id: string }>("services", { barbershop_id: shop.id, name: "Corte", duration_minutes: 45, price: 25000 })).id;
  otherShopService = (
    await insert<{ id: string }>("services", { barbershop_id: otherShop.id, name: "Corte", duration_minutes: 45, price: 1 })
  ).id;

  for (const barber_id of [andres, camilo, inactive]) {
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await insert("barber_schedules", { barbershop_id: shop.id, barber_id, weekday, start_time: "09:00", end_time: "13:00" });
    }
  }
  // Bloqueo de Andrés el lunes 7 de 11:00 a 12:00.
  await insert("barber_blocks", { barbershop_id: shop.id, barber_id: andres, starts_at: at("2030-01-07T11:00"), ends_at: at("2030-01-07T12:00") });
});

afterAll(async () => {
  // Borrar la barbería borra en cascada barberos, servicios, horarios, bloqueos y citas.
  if (shop) await db.from("barbershops").delete().eq("id", shop.id);
  if (otherShop) await db.from("barbershops").delete().eq("id", otherShop.id);
});

function input(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    service_id: corte,
    barber_id: andres,
    starts_at: at("2030-01-07T09:00"),
    customer_name: "Cliente de prueba",
    customer_phone: `+57300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, // distinto por reserva
    customer_email: "cliente@example.com",
    consent: "on",
    ...overrides,
  };
}

describe("bookAppointment", () => {
  it("reserva una hora libre con copia de precio y duración y fecha de consentimiento", async () => {
    const startsAt = at("2030-01-08T09:00");
    const result = await bookResult(shop, input({ starts_at: startsAt }), NOW);
    expect(result).toMatchObject({ ok: true, summary: { serviceName: "Corte", barberName: "Andrés", durationMinutes: 45 } });

    const { data } = await db
      .from("appointments")
      .select("starts_at, ends_at, service_price, service_duration_minutes, data_consent_at, status")
      .eq("barber_id", andres)
      .eq("starts_at", startsAt)
      .single();
    expect(data).toMatchObject({ service_duration_minutes: 45, status: "active" });
    expect(Number(data!.service_price)).toBe(25000);
    expect(new Date(data!.ends_at).getTime() - new Date(data!.starts_at).getTime()).toBe(45 * 60_000);
    expect(new Date(data!.data_consent_at).toISOString()).toBe(NOW.toISOString());
  });

  it("rechaza una hora ya reservada (aunque la interfaz la hubiera mostrado)", async () => {
    const startsAt = at("2030-01-09T09:00");
    expect(await bookResult(shop, input({ starts_at: startsAt }), NOW)).toMatchObject({ ok: true });
    expect(await bookResult(shop, input({ starts_at: startsAt }), NOW)).toMatchObject({ ok: false, code: "slot_taken" });
    expect(await activeCount(andres, startsAt)).toBe(1);
  });

  it("rechaza fuera de horario: la cita no cabe antes del fin del tramo", async () => {
    expect(await bookResult(shop, input({ starts_at: at("2030-01-07T12:30") }), NOW)).toMatchObject({ code: "slot_taken" });
  });

  it("rechaza una hora que no está en la rejilla de 15 minutos", async () => {
    expect(await bookResult(shop, input({ starts_at: at("2030-01-07T09:50") }), NOW)).toMatchObject({ code: "slot_taken" });
  });

  it("rechaza una hora dentro de un bloqueo", async () => {
    expect(await bookResult(shop, input({ starts_at: at("2030-01-07T11:15") }), NOW)).toMatchObject({ code: "slot_taken" });
  });

  it("rechaza el pasado, menos de 1 h de antelación y más allá de 30 días", async () => {
    const late = localDateTimeToUtc("2030-01-07T09:30", TZ); // "ahora" 9:30 → 10:00 queda a 30 min
    expect(await bookResult(shop, input({ starts_at: at("2030-01-07T10:00") }), late)).toMatchObject({ code: "slot_taken" });
    expect(await bookResult(shop, input({ starts_at: at("2030-01-05T10:00") }), NOW)).toMatchObject({ code: "slot_taken" });
    expect(await bookResult(shop, input({ starts_at: at("2030-02-07T10:00") }), NOW)).toMatchObject({ code: "slot_taken" });
  });

  it("rechaza barbero inactivo, servicio de otra barbería e ids inexistentes", async () => {
    const startsAt = at("2030-01-07T10:00");
    expect(await bookResult(shop, input({ barber_id: inactive, starts_at: startsAt }), NOW)).toMatchObject({ code: "unavailable" });
    expect(await bookResult(shop, input({ service_id: otherShopService, starts_at: startsAt }), NOW)).toMatchObject({ code: "unavailable" });
    expect(await bookResult(shop, input({ barber_id: randomUUID(), starts_at: startsAt }), NOW)).toMatchObject({ code: "unavailable" });
  });

  it('"Lo más pronto" asigna al barbero libre a esa hora', async () => {
    const startsAt = at("2030-01-10T10:00");
    expect(await bookResult(shop, input({ barber_id: andres, starts_at: startsAt }), NOW)).toMatchObject({ ok: true });
    const result = await bookResult(shop, input({ barber_id: "pronto", starts_at: startsAt }), NOW);
    expect(result).toMatchObject({ ok: true, summary: { barberName: "Camilo" } });
  });

  it("aplica el tope de 2 citas pendientes por número con un mensaje neutro, solo dentro de la barbería", async () => {
    const phone = "+573009998877";
    expect(await bookResult(shop, input({ customer_phone: phone, starts_at: at("2030-01-11T09:00") }), NOW)).toMatchObject({ ok: true });
    expect(await bookResult(shop, input({ customer_phone: phone, starts_at: at("2030-01-11T10:00") }), NOW)).toMatchObject({ ok: true });
    const third = await bookResult(shop, input({ customer_phone: phone, starts_at: at("2030-01-11T11:00") }), NOW);
    expect(third).toMatchObject({ ok: false, code: "limit_reached" });
    expect(third.ok ? "" : third.message).not.toMatch(/\d/); // no revela cuántas citas tiene (SEC-003)

    // En otra barbería el mismo número no está limitado por la primera.
    const otherBarber = (await insert<{ id: string }>("barbers", { barbershop_id: otherShop.id, name: "Otro" })).id;
    await insert("barber_schedules", { barbershop_id: otherShop.id, barber_id: otherBarber, weekday: 5, start_time: "09:00", end_time: "13:00" });
    const result = await bookResult(
      otherShop,
      input({ customer_phone: phone, service_id: otherShopService, barber_id: otherBarber, starts_at: at("2030-01-11T09:00") }),
      NOW,
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("dos reservas simultáneas del mismo barbero y hueco: exactamente una cita y un mensaje claro", async () => {
    const startsAt = at("2030-01-12T09:00");
    const results = await Promise.all([
      bookResult(shop, input({ barber_id: camilo, starts_at: startsAt }), NOW),
      bookResult(shop, input({ barber_id: camilo, starts_at: startsAt }), NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: "slot_taken" }); // nunca un error genérico
    expect(await activeCount(camilo, startsAt)).toBe(1); // la prueba de verdad: una sola fila (SC-004)
  });

  it('dos reservas simultáneas con "Lo más pronto" y dos barberos libres: se reparten (PERF-005)', async () => {
    const startsAt = at("2030-01-14T09:00");
    const results = await Promise.all([
      bookResult(shop, input({ barber_id: "pronto", starts_at: startsAt }), NOW),
      bookResult(shop, input({ barber_id: "pronto", starts_at: startsAt }), NOW),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await activeCount(andres, startsAt)).toBe(1);
    expect(await activeCount(camilo, startsAt)).toBe(1);
  });

  it("5 reservas simultáneas del mismo número con horas distintas: solo 2 se guardan (tope atómico)", async () => {
    const phone = "+573008887766";
    const slots: [string, string][] = [
      [andres, "2030-01-16T09:00"],
      [andres, "2030-01-16T10:00"],
      [andres, "2030-01-16T11:00"],
      [camilo, "2030-01-16T09:00"],
      [camilo, "2030-01-16T10:00"],
    ];
    const results = await Promise.all(
      slots.map(([barber, local]) =>
        bookResult(shop, input({ barber_id: barber, customer_phone: phone, starts_at: at(local) }), NOW),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    // Siempre el mensaje de límite, nunca un error genérico.
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "limit_reached")).toBe(true);
    const { count, error } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", shop.id)
      .eq("customer_phone", phone)
      .eq("status", "active");
    if (error) throw error;
    expect(count).toBe(2); // la prueba de verdad: dos filas, no cinco
  });
});

describe("submitBooking (envío del formulario)", () => {
  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }
  const valid = () => ({
    service_id: corte,
    barber_id: andres,
    starts_at: at("2030-01-15T09:00"),
    customer_name: "Cliente formulario",
    customer_phone: "300 555 0101",
    customer_email: "formulario@example.com",
    consent: "on",
    website: "",
  });
  const host = () => `${shop.subdomain}.${ROOT}`;

  it("honeypot relleno: responde éxito sin crear la cita (FR-012)", async () => {
    const result = await submitResult(host(), shop.subdomain, form({ ...valid(), website: "http://spam.example" }), NOW);
    expect(result).toEqual({ ok: true, summary: null });
    expect(await activeCount(andres, at("2030-01-15T09:00"))).toBe(0);
  });

  it("sin consentimiento: error en el campo consent y sin cita", async () => {
    const fields: Record<string, string> = valid();
    delete fields.consent;
    const result = await submitResult(host(), shop.subdomain, form(fields), NOW);
    expect(result).toMatchObject({ ok: false, code: "invalid", fieldErrors: { consent: expect.any(Array) } });
    expect(await activeCount(andres, at("2030-01-15T09:00"))).toBe(0);
  });

  it("subdominio del formulario distinto del host: rechaza y no crea la cita en la otra barbería (SEC-001)", async () => {
    const otherHost = `${otherShop.subdomain}.${ROOT}`;
    const result = await submitResult(otherHost, shop.subdomain, form(valid()), NOW);
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(await activeCount(andres, at("2030-01-15T09:00"))).toBe(0);
  });

  it("host del dominio raíz o ajeno: rechaza", async () => {
    expect(await submitResult(ROOT, shop.subdomain, form(valid()), NOW)).toMatchObject({ code: "unavailable" });
    expect(await submitResult("otro.com", shop.subdomain, form(valid()), NOW)).toMatchObject({ code: "unavailable" });
  });

  it("envío válido desde el host correcto: crea la cita", async () => {
    const result = await submitResult(host(), shop.subdomain, form(valid()), NOW);
    expect(result).toMatchObject({ ok: true, summary: { barberName: "Andrés" } });
    expect(await activeCount(andres, at("2030-01-15T09:00"))).toBe(1);
  });
});

describe("confirmación y token de cancelación (spec 003)", () => {
  it("guarda el hash del token del enlace, sin el token en claro y sin exponerlo al navegador", async () => {
    const startsAt = at("2030-01-17T09:00");
    const { result, confirmation } = await bookOutcome(shop, input({ starts_at: startsAt }), NOW);
    expect(result).toMatchObject({ ok: true });
    expect(confirmation).toBeDefined();

    const token = confirmation!.cancelUrl.split("/cancelar/")[1];
    expect(token).toHaveLength(43);
    expect(confirmation!.cancelUrl).toContain(`${shop.subdomain}.`);
    expect(JSON.stringify(result)).not.toContain(token); // el navegador no ve el token

    // Toda la fila: el token no puede estar en claro en ninguna columna.
    const { data } = await db.from("appointments").select("*").eq("barber_id", andres).eq("starts_at", startsAt).single();
    expect(data!.cancel_token_hash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("el correo va al cliente con los datos de la cita", async () => {
    const { confirmation } = await bookOutcome(
      shop,
      input({ starts_at: at("2030-01-17T10:00"), customer_email: "destino@example.com" }),
      NOW,
    );
    expect(confirmation).toMatchObject({
      to: "destino@example.com",
      barbershopName: shop.name,
      summary: { serviceName: "Corte", barberName: "Andrés" },
    });
  });

  it("una reserva rechazada no genera correo", async () => {
    const { result, confirmation } = await bookOutcome(shop, input({ starts_at: at("2030-01-17T18:00") }), NOW);
    expect(result).toMatchObject({ ok: false });
    expect(confirmation).toBeUndefined();
  });

  it("el honeypot no genera correo", async () => {
    const data = new FormData();
    data.set("website", "http://spam.example");
    const outcome = await submitOutcome(`${shop.subdomain}.${ROOT}`, shop.subdomain, data, NOW);
    expect(outcome.confirmation).toBeUndefined();
  });
});
