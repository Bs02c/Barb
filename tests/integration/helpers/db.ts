import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { insertAdminUser } from "../../../scripts/lib/admin-user.ts";

// Acceso de los tests a la base LOCAL como db_owner, para preparar y limpiar datos (spec 005, T024).
// db_owner es dueño de las tablas, así que RLS no le aplica: solo para preparar los datos, NUNCA para
// comprobar lo que ve la app. Lo que ve la app se comprueba siempre con sus funciones reales
// (withAdmin/withService con app_login).

// Barrera "solo local" (ADR-014; revisión spec 005, SEC-004): host local Y puerto de compose.dev.yml Y
// la marca app.env = 'local' que solo tiene la base local (db/init/roles.sh). La IP sola no basta: un
// túnel SSH a la base del VPS también es 127.0.0.1.
const url = process.env.DATABASE_OWNER_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || new URL(url).port !== "54329") {
  throw new Error("Los tests de integración solo corren contra la base local (127.0.0.1:54329): revisa DATABASE_OWNER_URL en .env.local");
}
for (const name of ["DATABASE_URL", "AUTH_DATABASE_URL"]) {
  const value = process.env[name];
  if (value && !["127.0.0.1", "localhost"].includes(new URL(value).hostname)) {
    throw new Error(`Los tests de integración solo corren contra la base local: ${name} no es local`);
  }
}

const pool = new pg.Pool({ connectionString: url, max: 4 });

// La marca se comprueba en la primera consulta (no con await de nivel superior: Playwright carga este
// archivo como CommonJS) y antes de cualquier escritura.
let localChecked: Promise<void> | undefined;
function ensureLocal(): Promise<void> {
  localChecked ??= pool.query<{ env: string | null }>("select current_setting('app.env', true) as env").then(({ rows }) => {
    if (rows[0].env !== "local") {
      throw new Error("La base no tiene la marca app.env = 'local' (db/init/roles.sh): los tests no corren contra ella");
    }
  });
  return localChecked;
}

/** Pool de db_owner de los tests: cada uso comprueba antes que la base es la local. */
export const ownerDb = {
  async query<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]) {
    await ensureLocal();
    return pool.query<T>(text, params);
  },
  async connect() {
    await ensureLocal();
    return pool.connect();
  },
};

const TABLES = ["barbershops", "barbers", "services", "barber_schedules", "barber_blocks", "appointments", "profiles"] as const;
type Table = (typeof TABLES)[number];

/** Inserta una fila en public.<table> y la devuelve tal como queda en la base (columnas en snake_case). */
export async function insert<T = Record<string, unknown>>(table: Table, row: Record<string, unknown>): Promise<T> {
  if (!TABLES.includes(table)) throw new Error(`Tabla no permitida: ${table}`);
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await ownerDb.query(
    `insert into public.${table} (${columns.map((c) => `"${c}"`).join(", ")}) values (${placeholders.join(", ")}) returning *`,
    Object.values(row),
  );
  return rows[0] as T;
}

/** Una consulta cualquiera como db_owner. */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await ownerDb.query<T>(sql, params)).rows;
}

/** Borra una barbería de prueba y, en cascada, todo lo suyo (incluidos los perfiles). */
export async function deleteBarbershop(id: string | undefined) {
  if (id) await ownerDb.query("delete from public.barbershops where id = $1", [id]);
}

/**
 * Usuario de Better Auth con contraseña y perfil de admin de la barbería (como el script de alta).
 * Devuelve sus credenciales. Borrar con deleteUser al terminar.
 */
export async function createTestAdmin(barbershopId: string, email: string, password = "Clave-De-Prueba-2030") {
  // Misma alta que scripts/create-barbershop.mts.
  const userId = await insertAdminUser(ownerDb, { email, passwordHash: await hashPassword(password), barbershopId });
  return { userId, email, password };
}

/** Borra un usuario de prueba (sesiones, cuenta y perfil caen en cascada). */
export async function deleteUser(userId: string | undefined) {
  if (userId) await ownerDb.query(`delete from identity."user" where id = $1`, [userId]);
}
