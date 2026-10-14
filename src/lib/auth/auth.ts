import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { authPool, readSecretEnv } from "@/lib/db/pool";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Login del panel con Better Auth (ADR-017 §5 y enmienda 1; spec 005, contracts/auth-and-ops.md).
// - Usuarios y sesiones en el esquema `identity`, con su propio rol `auth_login` (la app no lo ve).
// - Sin registro: los usuarios solo los crea scripts/create-barbershop.mts.
// - La ruta /api/auth solo deja pasar tres caminos (src/app/api/auth/[...all]/route.ts).
// - El límite de intentos solo se aplica en esa ruta HTTP, no en llamadas a auth.api desde el servidor.

const isLocal = ROOT_DOMAIN.startsWith("localhost") || ROOT_DOMAIN.includes(".localhost");
const protocol = isLocal ? "http" : "https";

/** Caminos de /api/auth que la app usa; el resto responde 404 (route.ts). */
export const AUTH_ALLOWED_PATHS = ["/sign-in/email", "/sign-out", "/get-session"] as const;

function authSecret(): string {
  const secret = readSecretEnv("BETTER_AUTH_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET (o BETTER_AUTH_SECRET_FILE) falta o mide menos de 32 caracteres");
  }
  return secret;
}

function signInMaxAttempts(): number {
  const value = Number(process.env.AUTH_SIGNIN_MAX_ATTEMPTS ?? 5);
  return Number.isInteger(value) && value > 0 ? value : 5;
}

function createAuth() {
  return betterAuth({
    database: authPool(),
    secret: authSecret(),
    // Cada barbería entra por su subdominio: la URL base se toma del Host, solo si es *.<dominio raíz>.
    baseURL: { allowedHosts: [`*.${ROOT_DOMAIN}`], protocol },
    trustedOrigins: [`${protocol}://*.${ROOT_DOMAIN}`],
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { expiresIn: 60 * 60 * 24 * 7 }, // 7 días; sin renovación automática (research §2)
    rateLimit: {
      enabled: true,
      storage: "database", // tabla identity."rateLimit": vale con varias instancias y tras reiniciar
      customRules: { "/sign-in/email": { window: 15 * 60, max: signInMaxAttempts() } },
    },
    advanced: {
      database: { generateId: "uuid" },
      // Caddy sobrescribe X-Real-IP con la IP real (ADR-017 §5); ninguna otra cabecera es de fiar.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      useSecureCookies: !isLocal,
      // Sin `domain` ni crossSubDomainCookies: la cookie es solo del subdominio de esa barbería.
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    // Ayuda de integración (no un plugin de funcionalidad): permite a signOut, desde una server action,
    // borrar la cookie (ADR-017, enmienda 1).
    plugins: [nextCookies()],
  });
}

const globalAuth = globalThis as unknown as { __auth?: ReturnType<typeof createAuth> };

/**
 * Instancia de Better Auth, creada en la primera petición (no al importar: `next build` no tiene base
 * ni secretos). Guardada en globalThis por la recarga en caliente de `next dev`.
 */
export function getAuth() {
  globalAuth.__auth ??= createAuth();
  return globalAuth.__auth;
}
