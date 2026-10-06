import type { z } from "zod";

/**
 * Errores de Zod → { campo: [mensajes] }, el formato que pintan los formularios con
 * aria-describedby. Único sitio de esta conversión: cliente y servidor muestran igual los errores.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}
