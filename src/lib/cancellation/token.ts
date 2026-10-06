import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Token de cancelación (spec 003, research §1 y §6). El token en claro solo existe en el correo;
// en la base se guarda su hash SHA-256.

/** 32 bytes aleatorios en base64url: 43 caracteres, 256 bits. */
export function generateCancelToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash en el formato `bytea` de PostgREST ("\x" + hex), para insertar y para buscar. */
export function hashToken(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * Enlace del correo. Se construye con el subdominio de la barbería y el dominio raíz configurado,
 * nunca con el Host de la petición (evita la inyección de cabecera Host).
 */
export function cancelUrl(subdomain: string, token: string, rootDomain: string = ROOT_DOMAIN): string {
  const isLocal = rootDomain.startsWith("localhost") || rootDomain.includes(".localhost");
  return `${isLocal ? "http" : "https"}://${subdomain}.${rootDomain}/cancelar/${token}`;
}
