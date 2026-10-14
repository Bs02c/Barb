import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getVerifiedSession, type VerifiedSession } from "@/lib/auth/session";
import { withAdmin } from "@/lib/db/client";
import { barbershops, profiles } from "@/lib/db/schema";

export type AdminBarbershop = {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
};

export type AdminContext =
  | { status: "anonymous" } // sin sesión → al login
  | { status: "forbidden" } // sesión de otra barbería o de un rol sin panel (super admin)
  | { status: "inactive" } // su barbería está desactivada (SEC-006: sin acceso)
  | { status: "ok"; session: VerifiedSession; email: string | null; barbershop: AdminBarbershop };

/**
 * ¿Quién está usando el panel de esta barbería?
 * - La sesión la verifica Better Auth contra la base en cada petición, no solo leyendo la cookie.
 * - Perfil y barbería en UNA consulta con la identidad del admin: RLS solo devuelve su perfil y su
 *   barbería, y la barbería solo si está activa (si no, el LEFT JOIN la deja en null).
 * - Además se exige que sea la barbería del subdominio: un admin de "elcorte" no usa el panel de
 *   "labarberia" (RLS ya le impediría ver sus datos, pero vería los suyos con otra marca).
 * `cache` evita repetir las consultas dentro de una misma petición.
 */
export const getAdminContext = cache(async (subdomain: string): Promise<AdminContext> => {
  const session = await getVerifiedSession();
  if (!session) return { status: "anonymous" };

  const [row] = await withAdmin(session, (tx) =>
    tx
      .select({
        role: profiles.role,
        barbershopId: profiles.barbershopId,
        barbershop: {
          id: barbershops.id,
          name: barbershops.name,
          subdomain: barbershops.subdomain,
          timezone: barbershops.timezone,
        },
      })
      .from(profiles)
      .leftJoin(barbershops, eq(barbershops.id, profiles.barbershopId))
      // Filtro explícito por el usuario: el super admin ve TODOS los perfiles por RLS, y sin esto
      // la decisión dependería de qué fila sale primero (revisión spec 005, SEC-005).
      .where(eq(profiles.userId, session.userId))
      .limit(1),
  );
  if (!row || row.role !== "admin" || !row.barbershopId) return { status: "forbidden" };
  if (!row.barbershop) return { status: "inactive" };
  if (row.barbershop.subdomain !== subdomain) return { status: "forbidden" };

  return { status: "ok", session, email: session.email, barbershop: row.barbershop };
});
