import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicBarbershop } from "@/lib/barbershops";
import { getBookingCatalog } from "@/lib/booking/queries";
import { deleteBarbershop, insert } from "./helpers/db";

// Datos de la portada (spec 006, FR-002, FR-003 y SC-006) con la conexión real de la app
// (withService con app_login). Dos barberías de prueba propias, preparadas como db_owner.

let shop: PublicBarbershop;
let otherShop: PublicBarbershop;

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  shop = await insert<PublicBarbershop>("barbershops", { name: "Test portada", subdomain: `test-portada-${suffix}` });
  otherShop = await insert<PublicBarbershop>("barbershops", { name: "Test otra", subdomain: `test-portada-otra-${suffix}` });

  const ana = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Ana" })).id;
  const beto = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Beto" })).id;
  const inactive = (await insert<{ id: string }>("barbers", { barbershop_id: shop.id, name: "Inactivo", is_active: false })).id;
  const foreign = (await insert<{ id: string }>("barbers", { barbershop_id: otherShop.id, name: "De otra" })).id;

  // Miércoles: Ana 9–12 y Beto 14–19 → 9:00–19:00. Lunes: solo Ana 10–18.
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: ana, weekday: 3, start_time: "09:00", end_time: "12:00" });
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: beto, weekday: 3, start_time: "14:00", end_time: "19:00" });
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: ana, weekday: 1, start_time: "10:00", end_time: "18:00" });
  // El barbero inactivo (sábado) y el de otra barbería (domingo) no cuentan.
  await insert("barber_schedules", { barbershop_id: shop.id, barber_id: inactive, weekday: 6, start_time: "08:00", end_time: "20:00" });
  await insert("barber_schedules", { barbershop_id: otherShop.id, barber_id: foreign, weekday: 7, start_time: "08:00", end_time: "20:00" });

  await insert("services", { barbershop_id: shop.id, name: "Corte", duration_minutes: 30, price: 25000, description: "Con lavado." });
  await insert("services", { barbershop_id: shop.id, name: "Barba", duration_minutes: 20, price: 15000 });
});

afterAll(async () => {
  await deleteBarbershop(shop?.id);
  await deleteBarbershop(otherShop?.id);
});

describe("getBookingCatalog en la portada", () => {
  it("horario semanal: tramos de barberos activos de esta barbería, de la apertura más temprana al cierre más tardío", async () => {
    const { weeklyHours, bookable } = await getBookingCatalog(shop);
    expect(bookable).toBe(true);
    expect(weeklyHours.map((d) => [d.weekday, d.open, d.close])).toEqual([
      [1, "10:00", "18:00"],
      [2, null, null],
      [3, "09:00", "19:00"],
      [4, null, null],
      [5, null, null],
      [6, null, null], // solo el barbero inactivo
      [7, null, null], // solo el barbero de otra barbería
    ]);
  });

  it("servicios con su descripción, o null si no tiene", async () => {
    const { services } = await getBookingCatalog(shop);
    expect(services.map((s) => [s.name, s.description])).toEqual([
      ["Barba", null],
      ["Corte", "Con lavado."],
    ]);
  });

  it("una barbería sin servicios no es reservable aunque tenga horario", async () => {
    const { bookable, services, weeklyHours } = await getBookingCatalog(otherShop);
    expect(services).toEqual([]);
    expect(weeklyHours[6].open).toBe("08:00");
    expect(bookable).toBe(false);
  });
});
