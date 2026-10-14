# Contrato: login, variables y operación (spec 005)

## Better Auth (`src/lib/auth/auth.ts`, `server-only`)

```ts
betterAuth({
  database: authPool,                 // pg.Pool de auth_login (máx. 3), search_path=identity en el rol
  secret: BETTER_AUTH_SECRET,         // ≥ 32 caracteres
  baseURL: { allowedHosts: [`*.${rootHost}`], protocol: isLocal ? "http" : "https" },
  trustedOrigins: [`${proto}://*.${rootDomain}`],
  emailAndPassword: { enabled: true, disableSignUp: true },
  disabledPaths: [/* todo salvo /sign-in/email, /sign-out y /get-session */],
  session: { expiresIn: 60 * 60 * 24 * 7 },
  rateLimit: { enabled: true, storage: "database",
               customRules: { "/sign-in/email": { window: 900, max: AUTH_SIGNIN_MAX_ATTEMPTS } } }, // 5 por defecto
  advanced: {
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    useSecureCookies: !isLocal,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    // sin crossSubDomainCookies: cookie solo del host
  },
  plugins: [nextCookies()],           // ayuda de Next.js para signOut desde server action
})
```

- La configuración exacta de `disabledPaths` se fija en la implementación con la lista de endpoints de 1.7.7.
- El test de login comprueba que `/sign-up/email`, `/forget-password`, `/request-password-reset`, `/update-user` y `/delete-user` responden 4xx.

## Rutas y flujo

| Ruta | Quién | Qué |
|---|---|---|
| `POST <barberia>.dominio/api/auth/sign-in/email` | formulario de login (`fetch`) | Límite de intentos, verificación de contraseña y cookie de sesión. El proxy no la reescribe |
| server action `confirmPanelAccess(subdomain)` | formulario tras un login correcto | `getAdminContext(subdomain)`. Si no es `ok`, cierra la sesión y devuelve el mensaje de hoy; si es `ok`, `redirect("/admin")` |
| server action `signOut()` | panel | `auth.api.signOut({ headers })` y redirección al login |
| `getAdminContext(subdomain)` | layout y acciones del panel | `auth.api.getSession({ headers })` → `VerifiedSession` → `withAdmin` (perfil + barbería en una consulta). Misma salida que hoy: `anonymous`, `forbidden`, `inactive` u `ok` |

Mensajes sin cambios:
- credenciales erróneas: "Correo o contraseña incorrectos.";
- respuesta 429: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." (texto nuevo, solo para el caso de límite).

## Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `DATABASE_URL` / `DATABASE_URL_FILE` | app | `app_login`. En local apunta a `127.0.0.1:54329` |
| `AUTH_DATABASE_URL` / `AUTH_DATABASE_URL_FILE` | app | `auth_login` |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_SECRET_FILE` | app | Secreto de firma de cookies |
| `DATABASE_OWNER_URL` | **solo** scripts locales (seed, alta, tests de integración) y servicio `migrate` | Nunca en el contenedor `app` (constitución II) |
| `AUTH_SIGNIN_MAX_ATTEMPTS` | app | Intentos de login por IP cada 15 min; 5 por defecto. En local, sin Caddy, todos comparten un cubo, así que `.env.example` propone 50 para no bloquear el desarrollo ni los E2E |
| `NEXT_PUBLIC_ROOT_DOMAIN`, `EMAIL_*`, `RESEND_API_KEY` | app | Sin cambios |

Desaparecen `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.

## Comandos (`package.json`)

| Comando | Qué hace |
|---|---|
| `npm run db:start` | `docker compose -f compose.dev.yml up -d db` |
| `npm run db:stop` | Detiene la base local |
| `npm run db:migrate` | `docker compose -f compose.dev.yml run --rm migrate up` (dbmate como `db_owner`) |
| `npm run db:reset` | `node scripts/db-reset.mts`: se niega fuera de local; borra y recrea la base, aplica las migraciones y carga `db/seed.sql` |
| `npm run test:db` | `pg_prove` dentro del contenedor sobre `db/tests/*.test.sql` |
| `npm run test:integration` | Vitest contra la base local (se niega si `DATABASE_URL` no es local) |
| `npm run barbershop:create -- …` | Igual que hoy. Usa `DATABASE_OWNER_URL` en una transacción; contra un destino no local exige `--confirm-remote` |
| `npm run perf:ttfb` | `scripts/measure-ttfb.mjs` |

Desaparece `npm run db:types` (research §3).

## Archivos de infraestructura

```text
compose.dev.yml          # db (127.0.0.1:54329, ver D2) + migrate (perfil, bajo demanda)
docker/db/Dockerfile     # postgres:17 + postgresql-17-pgtap + pg_prove
db/postgresql.conf       # data-model.md §Configuración
db/pg_hba.conf           # sin trust (research §4)
db/init/roles.sh         # roles idempotentes, contraseñas desde /run/secrets
db/init/secrets.example/ # nombres de archivo; los valores reales en db/init/secrets/ (ignorado por git)
db/migrations/0001_baseline.sql
db/seed.sql              # solo local; hash scrypt precalculado de la contraseña de demostración
db/tests/*.test.sql
db/maintenance/cleanup.sql
```
