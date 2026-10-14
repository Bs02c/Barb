# Quickstart: validar la migración (spec 005)

Requisitos: Docker en marcha y Node 24. Supabase local detenido (`npx supabase stop`), para liberar memoria y puertos.

## 1. Base local desde cero

```bash
npm run db:start          # contenedor db (PostgreSQL 17)
npm run db:reset          # migraciones (dbmate) + db/seed.sql
```

Esperado: dbmate aplica `0001_baseline` y el seed crea "La Barbería" y "El Corte" con sus admins de demostración.

## 2. Tests

```bash
npm run lint && npm run typecheck && npm test
npm run test:db           # pgTAP: ≥ 224 asserts antiguos + nuevos (07_roles)
npm run test:integration  # incluye schema-drift, aislamiento con app_login, pool, formatos y registro cerrado
npm run test:e2e          # reserva, cancelación y agenda con axe
```

Esperado: todo en verde y sin cambios en lo que comprueban los tests E2E.

## 3. Escenarios manuales

| Historia | Pasos | Resultado esperado |
|---|---|---|
| 1 | `http://labarberia.localhost:3000/reservar`: reservar una hora y abrir el enlace de `.outbox/` | Cita confirmada; el enlace cancela una vez |
| 2 | `/admin/login` con `admin@labarberia.example.com` | Llega a la agenda; cerrar sesión vuelve al login |
| 2 | Mismo admin en `elcorte.localhost:3000/admin/login` | "Esta cuenta no tiene acceso al panel de esta barbería." |
| 2 | Con `AUTH_SIGNIN_MAX_ATTEMPTS=5` en `.env.local`, 6 intentos fallidos seguidos | El 6.º muestra "Demasiados intentos…" |
| 3 | Panel de A: enviar a mano (devtools) un id de B a "eliminar barbero" | Sin efecto en B |
| 4 | `npm run barbershop:create -- --name "Prueba" --subdomain prueba --admin-email p@example.com` | Muestra la contraseña una vez y se puede entrar con ella |
| 4 | Arrancar la app con `DATABASE_URL` de `db_owner` | La app no arranca y explica el motivo, sin secretos |

## 4. Rendimiento

```bash
npm run build && npm run start   # en otra terminal
npm run perf:ttfb                # comparar con la medición previa de specs/005-migracion-postgresql/ttfb.md
```

Esperado: TTFB de `/reservar` y `/admin` no peor que +10 % (SC-005).

## 5. Limpieza de Supabase

```bash
git grep -i supabase -- ':!specs/00[1-4]*' ':!*.md'
```

Esperado: sin resultados en código, configuración ni dependencias (SC-007).
