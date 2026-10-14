// Alta de una barbería por el super admin: barbería + usuario admin + perfil, en UNA transacción.
// Uso (local):
//   npm run barbershop:create -- --name "La Barbería" --subdomain labarberia --admin-email admin@ejemplo.com
// Opcional: --timezone America/Bogota (por defecto). Contra un destino no local hay que pasar
// --confirm-remote y la DATABASE_OWNER_URL de ese entorno (nunca se usa db/seed.sql fuera de local).
// La contraseña del admin se genera al azar y se muestra una sola vez: compártela por un canal seguro.
//
// Se conecta como db_owner (dueño de las tablas; ADR-017 §3): crea el usuario de Better Auth
// directamente en el esquema identity, sin abrir nunca el registro (spec 005, research §2).
// Se ejecuta con Node 24 directamente (elimina los tipos de TypeScript sin compilar).

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    subdomain: { type: "string" },
    timezone: { type: "string", default: "America/Bogota" },
    "admin-email": { type: "string" },
    "confirm-remote": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const name = values.name?.trim();
const subdomain = values.subdomain?.trim().toLowerCase();
const email = values["admin-email"]?.trim().toLowerCase();
const timezone = values.timezone!;
if (!name || !subdomain || !email) {
  fail('Faltan datos. Uso: --name "Nombre" --subdomain nombre --admin-email correo [--timezone Zona/IANA]');
}

const fileVar = process.env.DATABASE_OWNER_URL_FILE;
const url = fileVar ? readFileSync(fileVar, "utf8").trim() : process.env.DATABASE_OWNER_URL;
if (!url) fail("Falta DATABASE_OWNER_URL (o DATABASE_OWNER_URL_FILE).");

const host = new URL(url).hostname;
const isLocal = host === "127.0.0.1" || host === "localhost";
if (!isLocal && !values["confirm-remote"]) {
  fail(`El destino es remoto (${host}). Repite con --confirm-remote si de verdad quieres crearla ahí.`);
}

// 18 bytes → 24 caracteres base64url: supera de sobra el mínimo de Better Auth (8).
const password = randomBytes(18).toString("base64url");
const passwordHash = await hashPassword(password);

console.log(`Destino: ${host}${isLocal ? " (local)" : " (REMOTO)"}`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");

  // 1. Barbería. La base de datos valida subdominio (formato, reservados, único) y zona horaria.
  const shop = await client.query<{ id: string }>(
    "insert into public.barbershops (name, subdomain, timezone) values ($1, $2, $3) returning id",
    [name, subdomain, timezone],
  );

  // 2. Usuario y cuenta con contraseña de Better Auth (sin registro público: solo se crea así).
  const user = await client.query<{ id: string }>(
    `insert into identity."user" (name, email, "emailVerified") values ($1, $1, true) returning id`,
    [email],
  );
  const userId = user.rows[0].id;
  await client.query(
    `insert into identity.account ("accountId", "providerId", "userId", password) values ($1::text, 'credential', $1::uuid, $2)`,
    [userId, passwordHash],
  );

  // 3. Perfil que lo une a su barbería con rol admin.
  await client.query("insert into public.profiles (user_id, role, barbershop_id) values ($1, 'admin', $2)", [
    userId,
    shop.rows[0].id,
  ]);

  await client.query("commit");
} catch (error) {
  await client.query("rollback").catch(() => {});
  // Solo código y restricción: el detalle de Postgres puede repetir los datos enviados.
  const { code, constraint } = error as { code?: string; constraint?: string };
  const reasons: Record<string, string> = {
    "23505":
      constraint === "barbershops_subdomain_key"
        ? `El subdominio "${subdomain}" ya está en uso.`
        : `Ya existe un usuario con el correo ${email}.`,
    "23514":
      "Datos no válidos: el subdominio solo admite minúsculas, números y guiones (www, app, api y admin están reservados) y la zona horaria debe ser IANA (p. ej. America/Bogota).",
  };
  fail(reasons[code ?? ""] ?? `No se pudo crear la barbería (código ${code ?? "desconocido"}). No se guardó nada.`);
} finally {
  await client.end();
}

console.log(`✓ Barbería "${name}" creada en el subdominio "${subdomain}" (${timezone}).`);
console.log(`✓ Admin: ${email}`);
console.log(`  Contraseña (se muestra una sola vez): ${password}`);
