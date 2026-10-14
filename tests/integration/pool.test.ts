import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VerifiedSession } from "@/lib/auth/session";
import { createTestAdmin, deleteBarbershop, deleteUser, insert } from "./helpers/db";

// Tests obligatorios 3 y 4 del ADR-017: la identidad vive solo dentro de cada transacción.
// Con un pool de UNA conexión (todas las transacciones reutilizan la misma), se comprueba que nada
// se arrastra de una petición a otra y que app_login, sin envoltorio, no ve nada.

// El pool de la app se sustituye por uno de una sola conexión ANTES de cargar la capa de datos.
const single = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
(globalThis as { __appPool?: pg.Pool }).__appPool = single;
const { withAdmin, withService } = await import("@/lib/db/client");
const { toDbError } = await import("@/lib/db/errors");

/** Solo en tests: en la app, VerifiedSession solo sale de getVerifiedSession (Better Auth). */
const sessionOf = (userId: string) => ({ userId, email: "test@example.com" }) as unknown as VerifiedSession;

let shopA: string;
let shopB: string;
let adminA: string;
let adminB: string;

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  shopA = (await insert<{ id: string }>("barbershops", { name: "Pool A", subdomain: `test-pool-a-${suffix}` })).id;
  shopB = (await insert<{ id: string }>("barbershops", { name: "Pool B", subdomain: `test-pool-b-${suffix}` })).id;
  adminA = (await createTestAdmin(shopA, `pool-a-${suffix}@example.com`)).userId;
  adminB = (await createTestAdmin(shopB, `pool-b-${suffix}@example.com`)).userId;
  await insert("barbers", { barbershop_id: shopA, name: "Solo de A" });
  await insert("barbers", { barbershop_id: shopB, name: "Solo de B" });
});

afterAll(async () => {
  await deleteUser(adminA);
  await deleteUser(adminB);
  await deleteBarbershop(shopA);
  await deleteBarbershop(shopB);
  await single.end();
});

const whoAmI = async () =>
  (await single.query<{ user: string; uid: string | null }>("select current_user as user, nullif(current_setting('app.user_id', true), '') as uid")).rows[0];

const barberNames = (rows: Record<string, unknown>[]) => rows.map((r) => r.name);

describe("identidad por transacción (pool de una conexión)", () => {
  it("tras withAdmin(A), la misma conexión vuelve a ser app_login sin identidad", async () => {
    const inside = await withAdmin(sessionOf(adminA), async (tx) => (await tx.execute(sql`select current_user as user`)).rows[0]);
    expect(inside).toEqual({ user: "authenticated" });
    expect(await whoAmI()).toEqual({ user: "app_login", uid: null });
  });

  it("dos peticiones seguidas (A y luego B) no comparten identidad", async () => {
    const seenByA = await withAdmin(sessionOf(adminA), async (tx) => (await tx.execute(sql`select name from public.barbers`)).rows);
    const seenByB = await withAdmin(sessionOf(adminB), async (tx) => (await tx.execute(sql`select name from public.barbers`)).rows);
    expect(barberNames(seenByA)).toContain("Solo de A");
    expect(barberNames(seenByA)).not.toContain("Solo de B");
    expect(barberNames(seenByB)).toContain("Solo de B");
    expect(barberNames(seenByB)).not.toContain("Solo de A");
  });

  it("withService después de withAdmin no conserva la identidad", async () => {
    await withAdmin(sessionOf(adminA), async (tx) => tx.execute(sql`select 1`));
    const uid = await withService(async (tx) => (await tx.execute(sql`select nullif(current_setting('app.user_id', true), '') as uid`)).rows[0]);
    expect(uid).toEqual({ uid: null });
  });

  it("si la transacción falla, la conexión tampoco arrastra la identidad", async () => {
    await withAdmin(sessionOf(adminA), async (tx) => tx.execute(sql`select 1/0`)).catch(() => {});
    expect(await whoAmI()).toEqual({ user: "app_login", uid: null });
  });
});

describe("app_login sin envoltorio (test 4)", () => {
  it("una consulta directa a una tabla de negocio da 42501", async () => {
    const error = await single.query("select * from public.barbers").then(
      () => null,
      (e: unknown) => e,
    );
    expect(toDbError(error)?.code).toBe("42501");
  });

  it("no puede leer las tablas del login", async () => {
    const error = await single.query(`select * from identity.session`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(toDbError(error)?.code).toBe("42501");
  });
});

describe("el código no fija rol ni identidad a nivel de sesión", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
    });
  }

  // Solo el código de la app (src/): los scripts de administración (db-reset) usan psql como superusuario.
  it("no hay set_config(…, false) ni SET ROLE / SET app.* en src/", () => {
    const offenders = files("src").filter((path) => {
      const text = readFileSync(path, "utf8");
      return /set_config\([^)]*,\s*false\s*\)/i.test(text) || /\bset\s+(session\s+)?role\b/i.test(text) || /\bset\s+app\./i.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
