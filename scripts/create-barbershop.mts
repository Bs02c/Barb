// Alta de una barbería por el super admin: barbería + usuario admin + perfil.
// Uso (local):
//   npm run barbershop:create -- --name "La Barbería" --subdomain labarberia --admin-email admin@ejemplo.com
// Opcional: --timezone America/Bogota (por defecto). Contra un entorno remoto hay que pasar
// --confirm-remote y las variables de ese entorno (nunca se usa seed.sql fuera de local, ADR-014).
// La contraseña del admin se genera al azar y se muestra una sola vez: compártela por un canal seguro.
//
// Se ejecuta con Node 24 directamente (elimina los tipos de TypeScript sin compilar).

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");

const host = new URL(url).hostname;
const isLocal = host === "127.0.0.1" || host === "localhost";
if (!isLocal && !values["confirm-remote"]) {
  fail(`El destino es remoto (${host}). Repite con --confirm-remote si de verdad quieres crearla ahí.`);
}

const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
// 18 bytes → 24 caracteres base64url: supera de sobra el mínimo de 8 (config.toml).
const password = randomBytes(18).toString("base64url");

console.log(`Destino: ${host}${isLocal ? " (local)" : " (REMOTO)"}`);

// 1. Barbería. La base de datos valida subdominio (formato, reservados, único) y zona horaria.
const { data: barbershop, error: shopError } = await db
  .from("barbershops")
  .insert({ name, subdomain, timezone })
  .select("id")
  .single();
if (shopError) {
  const reasons: Record<string, string> = {
    "23505": `El subdominio "${subdomain}" ya está en uso.`,
    "23514": `Datos no válidos: el subdominio solo admite minúsculas, números y guiones (www, app, api y admin están reservados) y la zona horaria debe ser IANA (p. ej. America/Bogota).`,
  };
  fail(reasons[shopError.code] ?? `No se pudo crear la barbería: ${shopError.message}`);
}

// 2. Usuario admin (sin registro público: solo se crea así).
const { data: created, error: userError } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userError) {
  await db.from("barbershops").delete().eq("id", barbershop.id);
  fail(`No se pudo crear el usuario: ${userError.message}`);
}

// 3. Perfil que lo une a su barbería con rol admin.
const { error: profileError } = await db
  .from("profiles")
  .insert({ user_id: created.user.id, role: "admin", barbershop_id: barbershop.id });
if (profileError) {
  await db.auth.admin.deleteUser(created.user.id);
  await db.from("barbershops").delete().eq("id", barbershop.id);
  fail(`No se pudo crear el perfil: ${profileError.message}`);
}

console.log(`✓ Barbería "${name}" creada en el subdominio "${subdomain}" (${timezone}).`);
console.log(`✓ Admin: ${email}`);
console.log(`  Contraseña (se muestra una sola vez): ${password}`);
