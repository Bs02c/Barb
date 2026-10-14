import "server-only";
import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";

// Pools de conexiones (spec 005, research §9). Uno por proceso, guardado en globalThis para que la
// recarga en caliente de `next dev` no abra un pool nuevo en cada cambio.
// Solo los importan src/lib/db/ y src/lib/auth/ (regla de ESLint): el resto de la app usa withAdmin/withService.

/** Valor de `NAME` o, en servidores, el contenido del archivo `NAME_FILE` (Docker secrets). */
export function readSecretEnv(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  if (file) return readFileSync(file, "utf8").trim();
  return process.env[name] || undefined;
}

function createPool(name: string, max: number): Pool {
  const connectionString = readSecretEnv(name);
  if (!connectionString) throw new Error(`Falta ${name} (o ${name}_FILE)`);
  const config: PoolConfig = { connectionString, max, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 };
  const pool = new Pool(config);
  // Una conexión inactiva que se cae (reinicio de la base) emite "error"; sin este manejador tumbaría el
  // proceso. El pool la descarta y abre otra en la siguiente petición. Solo el código: nunca la URL ni el
  // mensaje (puede nombrar host y puerto), por eso no usa logSafeError, que registra el mensaje de errores ajenos a la base.
  pool.on("error", (error) => console.error("Conexión de la base perdida", { code: (error as { code?: string }).code }));
  return pool;
}

const globalPools = globalThis as unknown as { __appPool?: Pool; __authPool?: Pool };

/** Pool de `app_login` (máx. 10): sin privilegios propios; withAdmin/withService cambian de rol por transacción. */
export function appPool(): Pool {
  globalPools.__appPool ??= createPool("DATABASE_URL", 10);
  return globalPools.__appPool;
}

/** Pool de `auth_login` (máx. 3): solo Better Auth, con search_path=identity fijado en el rol. */
export function authPool(): Pool {
  globalPools.__authPool ??= createPool("AUTH_DATABASE_URL", 3);
  return globalPools.__authPool;
}
