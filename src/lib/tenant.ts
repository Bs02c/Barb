// Resolución del inquilino (barbería) a partir del host de la petición (ADR-004).
// Lógica pura, sin acceso a datos: la usa src/proxy.ts y se prueba en tenant.test.ts.

/** Dominio raíz sobre el que se resuelven los subdominios. Lo usan el proxy y las server actions públicas. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

// Mismas reglas que el check de barbershops.subdomain en la base de datos.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin"]);

export type TenantResolution =
  | { kind: "root" } // dominio raíz: landing de la plataforma
  | { kind: "tenant"; subdomain: string } // posible barbería (falta comprobar que exista)
  | { kind: "invalid" }; // host ajeno o subdominio mal formado

function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

/**
 * Devuelve qué representa un host respecto al dominio raíz.
 * Ej. con rootDomain "midominio.com": "labarberia.midominio.com" → tenant "labarberia".
 * Los puertos se ignoran, así "labarberia.localhost:3000" funciona en local.
 */
export function resolveTenant(host: string | null, rootDomain: string): TenantResolution {
  if (!host) return { kind: "invalid" };

  const hostname = stripPort(host.trim().toLowerCase());
  const root = stripPort(rootDomain.trim().toLowerCase());

  if (hostname === root || hostname === `www.${root}`) return { kind: "root" };
  if (!hostname.endsWith(`.${root}`)) return { kind: "invalid" };

  const subdomain = hostname.slice(0, -(root.length + 1));
  // Un solo nivel: "a.b.midominio.com" no es una barbería.
  if (!SUBDOMAIN_PATTERN.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
    return { kind: "invalid" };
  }
  return { kind: "tenant", subdomain };
}
