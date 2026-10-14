import { carriesQuery, toDbError } from "@/lib/db/errors";

/**
 * Registra un error sin datos personales (constitución VI; revisión fase 4, SEC-002, y fase 5, MAINT-005).
 * - Error de PostgreSQL: solo código y restricción. Su `detail` ("Failing row contains …") lleva
 *   nombre, teléfono o correo, y su mensaje puede repetir un valor recibido.
 * - Error envuelto por Drizzle sin error de PostgreSQL dentro (p. ej. conexión caída): solo nombre y
 *   código. El mensaje de `DrizzleQueryError` incluye la consulta y sus parámetros (spec 005, research §8).
 * - Cualquier otro error (código propio, `fetch` a Resend): código y mensaje, que no llevan datos del cliente.
 */
export function logSafeError(context: string, error: unknown): void {
  const db = toDbError(error);
  if (db) {
    console.error(context, db);
    return;
  }
  const { name, code, message } = (error ?? {}) as { name?: string; code?: string; message?: string };
  if (carriesQuery(error)) {
    const cause = (error as { cause?: { code?: string } }).cause;
    console.error(context, { name, code: cause?.code ?? code });
    return;
  }
  console.error(context, { code, message });
}
