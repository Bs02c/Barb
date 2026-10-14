import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

// Comprobación de roles al arrancar (spec 005, FR-014 y SC-006) contra el catálogo real de la base:
// con app_login pasa; con el dueño de las tablas (db_owner), la app se negaría a arrancar.
// src/instrumentation.ts llama a assertSafeRoles y sale con process.exit(1) si lanza.

const pools = globalThis as unknown as { __appPool?: pg.Pool; __authPool?: pg.Pool };
const opened: pg.Pool[] = [];

function usePools(appUrl: string | undefined, authUrl: string | undefined) {
  pools.__appPool = new pg.Pool({ connectionString: appUrl, max: 1 });
  pools.__authPool = new pg.Pool({ connectionString: authUrl, max: 1 });
  opened.push(pools.__appPool, pools.__authPool);
}

const { assertSafeRoles } = await import("@/lib/db/startup-check");

afterAll(async () => {
  await Promise.all(opened.map((p) => p.end()));
  pools.__appPool = undefined;
  pools.__authPool = undefined;
});

describe("assertSafeRoles", () => {
  it("acepta la configuración real: app_login y auth_login", async () => {
    usePools(process.env.DATABASE_URL, process.env.AUTH_DATABASE_URL);
    await expect(assertSafeRoles()).resolves.toBeUndefined();
  });

  it("rechaza que la app se conecte como db_owner (dueño de las tablas: RLS no le aplica)", async () => {
    usePools(process.env.DATABASE_OWNER_URL, process.env.AUTH_DATABASE_URL);
    await expect(assertSafeRoles()).rejects.toThrow(/debe ser "app_login".*dueño de objetos/);
  });

  it("rechaza que Better Auth use la conexión de la app", async () => {
    usePools(process.env.DATABASE_URL, process.env.DATABASE_URL);
    await expect(assertSafeRoles()).rejects.toThrow(/debe ser "auth_login"/);
  });
});
