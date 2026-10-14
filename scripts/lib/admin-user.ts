// Alta de un usuario admin de una barbería, directamente en la base (sin el registro de Better Auth,
// que está cerrado). Única definición: la usan scripts/create-barbershop.mts y los tests
// (tests/integration/helpers/db.ts), así que un cambio del esquema de Better Auth se arregla aquí una
// vez y los tests prueban lo mismo que hace el script (revisión spec 005, MAINT-001).
//
// Columnas de Better Auth 1.7.7 (esquema identity, db/migrations/0001_baseline.sql): una cuenta de
// contraseña es una fila de `account` con providerId 'credential' y accountId = id del usuario.
// db/seed.sql repite esta forma en SQL para los usuarios de demostración: si cambia aquí, cambia allí.
// Ejecutar como db_owner y dentro de una transacción del llamador (el script y los tests la abren).

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function insertAdminUser(
  db: Queryable,
  { email, passwordHash, barbershopId }: { email: string; passwordHash: string; barbershopId: string },
): Promise<string> {
  const { rows } = await db.query(
    `insert into identity."user" (name, email, "emailVerified") values ($1, $1, true) returning id`,
    [email],
  );
  const userId = rows[0].id as string;
  await db.query(
    `insert into identity.account ("accountId", "providerId", "userId", password) values ($1::text, 'credential', $1::uuid, $2)`,
    [userId, passwordHash],
  );
  await db.query("insert into public.profiles (user_id, role, barbershop_id) values ($1, 'admin', $2)", [userId, barbershopId]);
  return userId;
}
