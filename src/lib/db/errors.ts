// Traducción única de los errores de PostgreSQL (spec 005, research §8; constitución VI).
//
// Por qué existe: el error de `pg` trae `detail` ("Failing row contains (…)") con nombre, teléfono o
// correo del cliente, y Drizzle envuelve cada fallo en `DrizzleQueryError`, cuyo `message` incluye la
// consulta Y SUS PARÁMETROS. Ninguno de los dos puede llegar a un log. La lógica de la app decide solo
// por `code` (SQLSTATE) y `constraint` (nombre de la restricción), nunca por el texto del mensaje.

export type DbError = { code: string; constraint: string | null };

type PgLikeError = { code: string; severity: string; constraint?: string };

/** Error del servidor PostgreSQL (`DatabaseError` de `pg`): SQLSTATE de 5 caracteres + severidad. */
function isPgError(value: unknown): value is PgLikeError {
  if (typeof value !== "object" || value === null) return false;
  const { code, severity } = value as Record<string, unknown>;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && typeof severity === "string";
}

/** El propio error o alguno de sus `cause` (Drizzle envuelve el de `pg`), hasta 5 niveles. */
function findInChain<T>(error: unknown, match: (e: unknown) => e is T): T | null {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (match(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * `{ code, constraint }` si el error viene de PostgreSQL (directo o envuelto por Drizzle); si no, null.
 * Nunca devuelve `message`, `detail`, la consulta ni los parámetros.
 */
export function toDbError(error: unknown): DbError | null {
  const pg = findInChain(error, isPgError);
  return pg ? { code: pg.code, constraint: pg.constraint ?? null } : null;
}

/** true si el error o su cadena trae la consulta con parámetros (DrizzleQueryError). */
export function carriesQuery(error: unknown): boolean {
  return (
    findInChain(error, (e): e is object => typeof e === "object" && e !== null && ("params" in e || "query" in e)) !==
    null
  );
}
