// Recrea la base LOCAL desde cero: borra `barberias`, aplica las migraciones (dbmate) y carga
// db/seed.sql (datos de demostración). Solo local (ADR-017 §7; spec 005, FR-008).
// Uso: npm run db:reset   (con `npm run db:start` hecho antes)
// Se ejecuta con Node 24 directamente (elimina los tipos de TypeScript sin compilar).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const COMPOSE = ["compose", "-f", "compose.dev.yml"];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_OWNER_URL;
if (!url) fail("Falta DATABASE_OWNER_URL en .env.local.");
const { hostname, port } = new URL(url);
if (!["127.0.0.1", "localhost"].includes(hostname) || port !== "54329") {
  fail(`DATABASE_OWNER_URL no apunta a la base local (127.0.0.1:54329): ${hostname}:${port}. No se recrea nada.`);
}

/** psql dentro del contenedor como superusuario (autenticación peer: solo con docker exec). */
function psqlAsPostgres(sql: string, database = "postgres") {
  execFileSync("docker", [...COMPOSE, "exec", "-T", "-u", "postgres", "db", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-d", database, "-c", sql], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

console.log("1/3 Recreando la base barberias…");
psqlAsPostgres("drop database if exists barberias with (force)");
psqlAsPostgres("create database barberias");
// roles.sh (idempotente) deja la base como la inicialización del contenedor: dueño db_owner y
// pg_stat_statements en el esquema extensions. El REVOKE CONNECT lo hace la migración base.
execFileSync("docker", [...COMPOSE, "exec", "-T", "-u", "postgres", "db", "bash", "/docker-entrypoint-initdb.d/10-roles.sh"], {
  stdio: ["ignore", "inherit", "inherit"],
});

console.log("2/3 Migraciones (dbmate)…");
execFileSync("docker", [...COMPOSE, "run", "--rm", "migrate", "up"], { stdio: "inherit" });

console.log("3/3 Datos de demostración (db/seed.sql)…");
// Como db_owner; app.env=local es la llave que exige el propio seed para cargarse.
const seed = `set app.env = 'local';\nset role db_owner;\n${readFileSync("db/seed.sql", "utf8")}`;
execFileSync(
  "docker",
  [...COMPOSE, "exec", "-T", "-u", "postgres", "db", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-d", "barberias", "-f", "-"],
  { input: seed, stdio: ["pipe", "inherit", "inherit"] },
);

console.log("✓ Base local lista.");
