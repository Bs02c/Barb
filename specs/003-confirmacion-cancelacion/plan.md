# Plan de implementación: confirmación por correo y cancelación con enlace

**Rama**: `003-confirmacion-cancelacion` | **Fecha**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Entrada**: spec pendiente de aprobación. Requisito previo: la corrección del tope atómico (spec 002, T019–T022) ya fusionada en `main`.

## Resumen

- **Confirmación**: al reservar se genera un token aleatorio y se guarda solo su hash en la cita. Después de responder al cliente (`after()`) se envía el correo de confirmación con el enlace `/cancelar/<token>`.
- **Cancelación**: la página del enlace muestra la cita y un botón. Una server action resuelve la barbería del Host y cancela con una sola sentencia atómica.
- **Desarrollo y tests**: el correo se escribe en `.outbox/`; en producción va por la API HTTP de Resend.
- **Dependencias**: ninguna nueva.

Detalle en [research.md](research.md), [data-model.md](data-model.md) y [contracts/cancellation.md](contracts/cancellation.md).

## Contexto técnico

**Lenguaje/Versión**: TypeScript 5, Next.js 16.3 (App Router, `after` de `next/server`), React 19

**Dependencias**: ninguna nueva. Resend se llama con `fetch` y la plantilla es HTML con `escapeHtml`.

**Almacenamiento**: PostgreSQL. Una columna nueva, `appointments.cancel_token_hash`, con índice único parcial.

**Testing**: Vitest (unitarios e integración), pgTAP, Playwright + axe

**Variables de entorno nuevas** (en `.env.example`, sin valores):
- `EMAIL_TRANSPORT`: `outbox` o `resend`. Por defecto `outbox` fuera de producción.
- `EMAIL_FROM`: por ejemplo `Reservas <onboarding@resend.dev>`.
- `RESEND_API_KEY`: ya existe.

**Restricciones**: el token nunca va al navegador, a los logs ni a la base en claro; la cancelación no ocurre en GET; el código es portable.

## Verificación de la constitución

| Principio | Cumplimiento |
|---|---|
| I. Aislamiento | La server action resuelve la barbería del Host y la cancelación filtra por `barbershop_id` + hash. Un token de otra barbería es inválido (test) ✅ |
| II. Secretos | `RESEND_API_KEY` solo en `src/lib/email/send.ts` (server-only) ✅ |
| III. Integridad | Cancelación atómica condicionada; el trigger impide la reactivación; la exclusión libera la hora ✅ |
| IV. UTC | Las horas del correo y de la página se formatean con `src/lib/time.ts` ✅ |
| V. Validación | Token validado con Zod; aleatorio, con caducidad (inicio de la cita) y de un solo uso ✅ |
| VI. Datos personales | Los logs llevan solo código y mensaje; la página no muestra teléfono ni correo ✅ |
| VII. Simplicidad | Sin dependencias, sin cola, sin columna de expiración. El ADR-015 registra el envío con `after()` y el transporte outbox ✅ |
| VIII. Portabilidad | `after()` funciona en Vercel y en Node propio; no se usa nada de Vercel ✅ |
| Límites | **Preguntar primero**: cambio de esquema (`cancel_token_hash`) y ADR-015. Se piden con este plan ✅ |

**Resultado**: pasa, sujeto a la aprobación del usuario.

## Estructura del código

```text
supabase/migrations/<ts>_appointments_cancel_token.sql   # database
supabase/tests/06_cancel_token.test.sql                   # database
src/lib/cancellation/                                     # principal
├── token.ts (+ token.test.ts)
├── schemas.ts, cancellation-state.ts, messages.ts
├── queries.ts, cancel.ts, actions.ts
src/lib/email/                                            # principal
├── send.ts, confirmation.ts (+ confirmation.test.ts)
└── escape.ts (+ escape.test.ts)
src/lib/booking/{book,submit,actions}.ts                  # principal (cambios)
src/app/s/[subdomain]/cancelar/[token]/page.tsx           # frontend
src/components/cancellation/cancel-form.tsx               # frontend
tests/integration/cancellation.test.ts                    # principal
tests/integration/booking.test.ts                         # principal (ajustes)
tests/e2e/cancellation.spec.ts                            # frontend
.gitignore (+ /.outbox/), .env.example                    # principal
```

## Ejecución por agentes (modelo Sonnet)

Para ahorrar tokens, los agentes de desarrollo corren con `model: sonnet`, fijado en `.claude/agents/database.md` y `frontend.md`. Cada tarea de [tasks.md](tasks.md) es autocontenida: archivos, contrato y criterio de "hecho".

1. **database**: T002–T003. Va primero; es corto.
2. **principal**: T004–T010. La sesión principal puede correr en Sonnet si el usuario lo elige. Publica el contrato (T004) antes de lanzar al frontend.
3. **frontend**, en paralelo una vez hecho T004: T011–T012.
4. **principal**: T013–T016 (integración, revisión, cierre).

**Revisión del hito**: los tres agentes revisores. Recomendación: `security-reviewer` con el modelo por defecto (token, Host, correo) y los otros dos con Sonnet.

## Seguimiento de complejidad

| Desviación | Por qué | Alternativa más simple descartada porque |
|---|---|---|
| Transporte `outbox` además de Resend | Tests E2E reales sin red, y Resend de pruebas no entrega a `example.com` | Mockear el envío no prueba el enlace de punta a punta |
