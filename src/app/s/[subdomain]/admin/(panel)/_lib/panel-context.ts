import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/session";

/**
 * Guarda de cada página del panel (el layout no se vuelve a ejecutar al navegar entre secciones).
 * Sin sesión → login. Sesión sin acceso → null: la página no muestra nada y el layout
 * enseña la pantalla de "sin acceso" en la siguiente carga completa.
 */
export async function getPanelContext(subdomain: string) {
  const context = await getAdminContext(subdomain);
  if (context.status === "anonymous") redirect("/admin/login");
  return context.status === "ok" ? context : null;
}
