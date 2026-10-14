import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicBarbershop } from "@/lib/barbershops";
import { getBookingCatalog, loadSlots } from "@/lib/booking/queries";
import { hashToken } from "@/lib/cancellation/token";
import { withService } from "@/lib/db/client";
import { appointments, barberSchedules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { deleteBarbershop, insert } from "./helpers/db";

// Test obligatorio 9 del ADR-017 (riesgo R7): al dejar PostgREST, los tipos que llegan del driver
// cambian (Date, numeric como texto, Buffer). Este test fija lo que la app recibe de verdad
// (spec 005, research §7).

let shop: PublicBarbershop;
let barberId: string;
let serviceId: string;
const TOKEN = "t".repeat(43);

beforeAll(async () => {
  shop = await insert<PublicBarbershop>("barbershops", { name: "Test formatos", subdomain: `test-fmt-${randomUUID().slice(0, 8)}` });
  barberId = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Barbero" })).id;
  serviceId = (
    await insert<{ id: string }>("services", { barbershop_id: shop.id, name: "Corte", duration_minutes: 30, price: "25000.50" })
  ).id;
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: barberId, weekday: 1, start_time: "09:00", end_time: "13:30" });
  await insert("appointments", {
    barbershop_id: shop.id,
    barber_id: barberId,
    service_id: serviceId,
    starts_at: "2030-01-07T15:00:00Z",
    ends_at: "2030-01-07T15:30:00Z",
    service_duration_minutes: 30,
    service_price: "25000.50",
    customer_name: "Cliente",
    customer_phone: "+573001234567",
    customer_email: "cliente@example.com",
    data_consent_at: "2030-01-01T00:00:00Z",
    cancel_token_hash: hashToken(TOKEN),
  });
});

afterAll(async () => {
  await deleteBarbershop(shop?.id);
});

describe("formatos que recibe la app", () => {
  it("timestamptz llega como Date con el instante exacto (UTC)", async () => {
    const [row] = await withService((tx) =>
      tx.select({ startsAt: appointments.startsAt }).from(appointments).where(eq(appointments.barbershopId, shop.id)),
    );
    expect(row.startsAt).toBeInstanceOf(Date);
    expect(row.startsAt.toISOString()).toBe("2030-01-07T15:00:00.000Z");
  });

  it("numeric llega como texto y el catálogo lo da como número con sus decimales", async () => {
    const catalog = await getBookingCatalog(shop);
    expect(catalog.services[0].price).toBe(25000.5);
  });

  it("time llega como HH:MM:SS (hora local del horario)", async () => {
    const [row] = await withService((tx) =>
      tx.select({ start: barberSchedules.startTime, end: barberSchedules.endTime }).from(barberSchedules).where(eq(barberSchedules.barbershopId, shop.id)),
    );
    expect(row).toEqual({ start: "09:00:00", end: "13:30:00" });
  });

  it("bytea llega como Buffer de 32 bytes igual a hashToken", async () => {
    const [row] = await withService((tx) =>
      tx.select({ hash: appointments.cancelTokenHash }).from(appointments).where(eq(appointments.barbershopId, shop.id)),
    );
    expect(Buffer.isBuffer(row.hash)).toBe(true);
    expect(row.hash!.equals(hashToken(TOKEN))).toBe(true);
  });

  it("la disponibilidad respeta la cita existente (Date de ida y vuelta)", async () => {
    const catalog = await getBookingCatalog(shop);
    const slots = await loadSlots(shop, { service: catalog.services[0], barbers: catalog.barbers }, {
      now: new Date("2030-01-06T12:00:00Z"),
      fromDate: "2030-01-07",
      days: 1,
    });
    const starts = slots.map((s) => s.startsAt);
    expect(starts).not.toContain("2030-01-07T15:00:00.000Z"); // ocupada (10:00 en Bogotá)
    expect(starts).toContain("2030-01-07T14:00:00.000Z"); // 9:00 en Bogotá, libre
  });
});
