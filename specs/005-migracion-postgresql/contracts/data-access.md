# Contrato: capa de datos `src/lib/db/` (spec 005)

Única puerta a PostgreSQL desde la app (constitución I y 1.2.0). Todos los módulos son `server-only`.

## Módulos

| Archivo | Exporta | Notas |
|---|---|---|
| `pool.ts` | **nada público** | `pg.Pool` de `app_login` (máx. 10, `connectionTimeoutMillis` 5000) guardado en `globalThis`. Lee `DATABASE_URL` o `DATABASE_URL_FILE`. Solo lo importan `client.ts` y `startup-check.ts` (regla ESLint) |
| `schema.ts` | tablas Drizzle (`barbershops`, `profiles`, `barbers`, `services`, `barberSchedules`, `barberBlocks`, `appointments`) y enums | Escrito a mano, solo columnas (research §3) |
| `client.ts` | `withAdmin`, `withService`, tipo `Tx` | Ver abajo |
| `errors.ts` | `toDbError(e): DbError \| null`, tipo `DbError = { code: string; constraint: string \| null }` | Desenvuelve `DrizzleQueryError.cause`. Nunca devuelve `message`, `detail` ni parámetros |
| `startup-check.ts` | `assertSafeRoles(): Promise<void>` | Research §10. La llama `src/instrumentation.ts` |

## `withAdmin` / `withService`

```ts
type VerifiedSession = { readonly userId: string; readonly __verified: unique symbol };

/** Transacción como `authenticated` con la identidad de la sesión verificada por Better Auth. */
withAdmin<T>(session: VerifiedSession, fn: (tx: Tx) => Promise<T>): Promise<T>

/** Transacción como `service_role` (se salta RLS): TODA consulta filtra por barbershop_id del Host. */
withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
```

**Reglas:**
- `VerifiedSession` solo la fabrica `src/lib/auth/session.ts` a partir de `auth.api.getSession()`. Es un tipo marcado: un string del request no compila.
- Al empezar, ejecutan en la transacción:
  - `select set_config('role', 'authenticated', true), set_config('app.user_id', $1, true)`;
  - en servicio, `select set_config('role', 'service_role', true)`.
- `fn` usa solo `tx`. Dentro, únicamente SQL: ni `fetch`, ni correo, ni render (el correo sigue en `after()`).
- Prohibido `SET` o `set_config(…, false)` en cualquier parte del código. Lo detecta una búsqueda en el test de integración del pool.
- ESLint `no-restricted-imports`:
  - `@/lib/db/client` → `withService` prohibido desde `src/lib/admin/**`, `src/app/**/admin/**` y `src/components/admin/**`;
  - `@/lib/db/pool` prohibido fuera de `src/lib/db/`;
  - `pg` y `drizzle-orm/node-postgres` prohibidos fuera de `src/lib/db/` y `src/lib/auth/`.

## Mapeo de las llamadas actuales

| Hoy | Después |
|---|---|
| `createClient()` (sesión, RLS) en `src/lib/admin/{session,queries,actions}.ts` | `withAdmin(session, tx => …)` |
| `createServiceClient()` en `barbershops.ts`, `booking/{queries,book}.ts`, `cancellation/{queries,cancel}.ts` | `withService(tx => …)`, con el mismo filtro explícito por `barbershop_id` |
| Joins `barbers(name)`, `services(name)` de PostgREST | `leftJoin` en una sola sentencia |
| `PostgrestError` y `error.message.includes("appointments_phone_limit")` | `toDbError(e)` y `constraint === "appointments_phone_limit"` |
| `hashToken()` → `"\\x…"` | `hashToken()` → `Buffer` |

Los tipos que devuelven las funciones públicas (`AgendaAppointment`, `PublicBarbershop`, `CatalogService`, `CancellationDetails`, `Barber`, `Service`, `ScheduleSlot`, `Block`) **no cambian**: fechas en ISO y precios en `number` donde hoy lo son. Los componentes no se tocan.

## Las 15 operaciones del panel (aislamiento solo con RLS; test 2)

1. `getAdminContext` lee `profiles`.
2. `getAdminContext` lee `barbershops`.
3. `listBarbers`.
4. `listServices`.
5. `listScheduleSlots`.
6. `listUpcomingBlocks`.
7. `listAppointmentsForDay`.
8. `renameBarber` y `setBarberActive` (UPDATE `barbers` por id).
9. `deleteBarber`.
10. `updateService` y `setServiceActive`.
11. `deleteService`.
12. `deleteScheduleSlot`.
13. `deleteBlock`.
14. `adminCancelAppointment`.
15. Los INSERT de `createBarber`, `createService`, `addScheduleSlot` y `addBlock` con `barbershop_id` ajeno (los rechaza el `WITH CHECK`).

Test: un admin de A con ids o `barbershop_id` de B obtiene 0 filas, 0 afectadas o 42501, siempre con la conexión real de `app_login`.
