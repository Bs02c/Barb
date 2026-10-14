import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "./auth";

declare const verified: unique symbol;

/**
 * Identidad de un usuario cuya sesión verificó Better Auth contra la base en ESTA petición.
 * Es un tipo marcado: solo este módulo lo fabrica, así que withAdmin nunca recibe un id que venga
 * del navegador (constitución I; contracts/data-access.md).
 */
export type VerifiedSession = { readonly userId: string; readonly email: string; readonly [verified]: true };

/**
 * Sesión del usuario de esta petición, verificada contra la base (no solo la cookie), o null.
 * `cache`: una sola verificación por petición aunque la pidan el layout, la página y varias consultas.
 */
export const getVerifiedSession = cache(async (): Promise<VerifiedSession | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  return { userId: result.user.id, email: result.user.email } as VerifiedSession;
});
