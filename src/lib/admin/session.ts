import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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
  | { status: "ok"; userId: string; email: string | null; barbershop: AdminBarbershop };

/**
 * ¿Quién está usando el panel de esta barbería?
 * - La sesión se valida contra Supabase Auth (getUser), no solo leyendo la cookie.
 * - RLS solo devuelve la barbería del propio admin y solo si está activa.
 * - Además se exige que sea la barbería del subdominio: un admin de "elcorte" no usa el
 *   panel de "labarberia" (RLS ya le impediría ver sus datos, pero vería los suyos con otra marca).
 * `cache` evita repetir las consultas dentro de una misma petición.
 */
export const getAdminContext = cache(async (subdomain: string): Promise<AdminContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const { data: profile } = await supabase.from("profiles").select("role, barbershop_id").maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.barbershop_id) return { status: "forbidden" };

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id, name, subdomain, timezone")
    .eq("id", profile.barbershop_id)
    .maybeSingle();
  if (!barbershop) return { status: "inactive" };
  if (barbershop.subdomain !== subdomain) return { status: "forbidden" };

  return { status: "ok", userId: user.id, email: user.email ?? null, barbershop };
});
