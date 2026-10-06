import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublicBarbershop } from "@/lib/barbershops";
import { createServiceClient } from "@/lib/supabase/service";

// Página pública de una barbería (fase 2): solo barberías activas y solo campos públicos.
// Usa el seed local (labarberia) y crea una barbería desactivada que borra al terminar.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local"); // ADR-014
}

const db = createServiceClient();
const inactiveSubdomain = `inactiva-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  const { error } = await db
    .from("barbershops")
    .insert({ name: "Barbería inactiva", subdomain: inactiveSubdomain, is_active: false });
  if (error) throw error;
});

afterAll(async () => {
  await db.from("barbershops").delete().eq("subdomain", inactiveSubdomain);
});

describe("getPublicBarbershop", () => {
  it("devuelve una barbería activa con solo sus campos públicos", async () => {
    const barbershop = await getPublicBarbershop("labarberia");
    expect(barbershop).not.toBeNull();
    expect(Object.keys(barbershop!).sort()).toEqual(["id", "name", "subdomain", "timezone"]);
    expect(barbershop!.subdomain).toBe("labarberia");
  });

  it("devuelve null si el subdominio no existe", async () => {
    expect(await getPublicBarbershop("no-existe-esta-barberia")).toBeNull();
  });

  it("devuelve null si la barbería está desactivada", async () => {
    expect(await getPublicBarbershop(inactiveSubdomain)).toBeNull();
  });
});
