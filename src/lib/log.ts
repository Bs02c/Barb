/**
 * Registra un error sin datos personales: solo código y mensaje, nunca el objeto completo, cuyo
 * `details` puede llevar nombre, teléfono, correo o token ("Failing row contains …").
 * Constitución VI; revisión fase 4 (SEC-002) y fase 5 (MAINT-005).
 */
export function logSafeError(context: string, error: unknown): void {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  console.error(context, { code, message });
}
