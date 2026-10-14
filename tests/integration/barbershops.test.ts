import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublicBarbershop } from "@/lib/barbershops";
import { insert, query } from "./helpers/db";

// Página pública de una barbería (fase 2): solo barberías activas y solo campos públicos.
// Usa el seed local (labarberia) y crea una barbería desactivada que borra al terminar
// (como db_owner, helpers/db.ts, solo base local).
const inactiveSubdomain = `inactiva-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await insert("barbershops", { name: "Barbería inactiva", subdomain: inactiveSubdomain, is_active: false });
});

afterAll(async () => {
  await query("delete from public.barbershops where subdomain = $1", [inactiveSubdomain]);
});

describe("getPublicBarbershop", () => {
  it("devuelve una barbería activa con solo sus campos públicos", async () => {
    const barbershop = await getPublicBarbershop("labarberia");
    expect(barbershop).not.toBeNull();
    expect(Object.keys(barbershop!).sort()).toEqual(["address", "description", "id", "name", "subdomain", "timezone"]);
    expect(barbershop!.subdomain).toBe("labarberia");
  });

  it("incluye la descripción y la dirección públicas, o null si no tiene (spec 006)", async () => {
    expect(await getPublicBarbershop("labarberia")).toMatchObject({
      description: "Cortes clásicos y barba con navaja, sin afanes.",
      address: "Calle 45 # 12-30, Bogotá",
    });
    expect(await getPublicBarbershop("elcorte")).toMatchObject({ description: null, address: null });
  });

  it("devuelve null si el subdominio no existe", async () => {
    expect(await getPublicBarbershop("no-existe-esta-barberia")).toBeNull();
  });

  it("devuelve null si la barbería está desactivada", async () => {
    expect(await getPublicBarbershop(inactiveSubdomain)).toBeNull();
  });
});
