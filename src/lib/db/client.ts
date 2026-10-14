import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { VerifiedSession } from "@/lib/auth/session";
import { appPool } from "./pool";
import * as schema from "./schema";

// Única puerta a PostgreSQL desde la app (constitución I; spec 005, contracts/data-access.md).
// La conexión es `app_login`, que no puede leer ni escribir nada por sí misma: cada transacción
// cambia de rol con set_config(..., true), que se deshace solo al terminar la transacción, así que
// una conexión reutilizada del pool nunca arrastra la identidad de la petición anterior.
//
// Dentro de `fn` solo SQL: nada de fetch, correo ni render (retendrían la conexión; research §9).

type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let db: Db | undefined;
function getDb(): Db {
  db ??= drizzle(appPool(), { schema });
  return db;
}

/**
 * Transacción como `authenticated` con la identidad de la sesión verificada por Better Auth.
 * RLS limita todo a la barbería del admin; solo acepta una VerifiedSession (nunca un dato del request).
 */
export function withAdmin<T>(session: VerifiedSession, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('role', 'authenticated', true), set_config('app.user_id', ${session.userId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Transacción como `service_role`, que SE SALTA RLS: solo para la web pública (reserva, cancelación).
 * TODA consulta dentro DEBE filtrar por el barbershop_id resuelto del Host (constitución I).
 * Prohibido importarla desde el panel (regla de ESLint).
 */
export function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'service_role', true)`);
    return fn(tx);
  });
}
