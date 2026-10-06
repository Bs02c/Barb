# Plan de implementación: reserva pública de citas

**Rama**: `002-reserva-publica` | **Fecha**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Entrada**: spec aprobada por el usuario el 2026-10-06 (horas cada 15 min; hasta 30 días con 1 h de antelación; tope de 2 citas pendientes por número).

## Resumen

Flujo de reserva en el subdominio de cada barbería (`/reservar`) en 4 pasos guardados en la URL, más una confirmación en pantalla:
- **Disponibilidad**: la calcula una función pura de TypeScript con los tramos, bloqueos y citas de la barbería. La misma función vuelve a validar al confirmar.
- **Escritura**: una server action con la clave secreta, filtrando por la barbería del subdominio. Incluye honeypot, tope por número, copia de duración y precio, y reintento ante `40P01`.
- **Política de datos**: página `/privacidad` (plantilla).
- **Tests**: unitarios, integración y Playwright con `axe`.

**Sin cambios de esquema.** Detalle en [research.md](research.md), [data-model.md](data-model.md) y [contracts/booking.md](contracts/booking.md).

## Contexto técnico

**Lenguaje/Versión**: TypeScript 5, Next.js 16.3 (App Router), React 19

**Dependencias principales**: `@supabase/supabase-js` (clave secreta en servidor), Zod 4, shadcn/ui; **nuevas de desarrollo**: `@playwright/test`, `@axe-core/playwright` (ADR-012) y Chromium de Playwright

**Almacenamiento**: PostgreSQL (Supabase) sin cambios

**Testing**: Vitest (unitarios e integración), Playwright + axe (E2E)

**Plataforma**: Node 24; Supabase local en Docker

**Tipo de proyecto**: aplicación web

**Objetivos de rendimiento**: cálculo de 30 días de huecos en pocos ms en memoria (objetivo inicial < 1 ms; medido ~2–3 ms tras la revisión, aceptado); 3 consultas indexadas por petición

**Restricciones**: sin clave secreta en el navegador; código portable; sin servicios externos nuevos

**Escala**: pocos barberos por barbería, cientos de citas al mes

## Verificación de la constitución

| Principio | Cumplimiento |
|---|---|
| I. Aislamiento | Toda lectura y escritura con la clave secreta filtra por el `barbershop_id` de `getPublicBarbershop(subdomain)`; los ids de servicio y barbero se buscan dentro de esa barbería ✅ |
| II. Secretos | Solo en módulos `server-only` y server actions ✅ |
| III. Integridad | La exclusión de la fase 1 decide los solapamientos; el horario y los bloqueos se validan en el servidor con la misma función que muestra las horas ✅ |
| IV. UTC | Conversión solo con `src/lib/time.ts`; la URL y el formulario viajan en UTC ✅ |
| V. Validación | Zod compartido; E.164; honeypot y tope por número ✅ |
| VI. Datos personales | Solo nombre, número y correo; consentimiento obligatorio con fecha; política enlazada ✅ (texto de la política pendiente de revisión legal) |
| VII. Simplicidad | Sin cambios de esquema, sin librería de estado, sin `libphonenumber`; el tope no atómico se acepta (research §4) ✅ |
| VIII. Portabilidad | Nada exclusivo de Vercel ✅ |
| Límites | **Preguntar primero**: añadir `@playwright/test` y `@axe-core/playwright` y descargar Chromium (≈150 MB): se pide con este plan ✅ |

**Resultado**: pasa.

## Estructura

### Documentación

```text
specs/002-reserva-publica/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/booking.md
├── checklists/requirements.md
└── tasks.md
```

### Código

```text
src/lib/booking/                 # agente principal
├── availability.ts (+ .test.ts)
├── phone.ts (+ .test.ts)
├── schemas.ts (+ .test.ts)
├── queries.ts                   # server-only
├── book.ts                      # server-only, lógica de la reserva
├── actions.ts                   # "use server": createBooking
└── booking-state.ts
src/app/s/[subdomain]/           # agente frontend
├── page.tsx                     # + botón "Reservar cita"
├── reservar/page.tsx            # pasos 1–4 y confirmación
└── privacidad/page.tsx
src/components/booking/          # agente frontend
tests/integration/booking.test.ts   # principal
tests/e2e/booking.spec.ts           # frontend (Playwright + axe)
playwright.config.ts                # frontend
```

## Ejecución

- **Principal**: `src/lib/booking/` con tests unitarios e integración, y el contrato. Va primero (bloquea las páginas).
- **Frontend**, en paralelo una vez publicado el contrato (firmas y tipos): páginas del flujo, `/privacidad`, botón de la página de la barbería, Playwright y los tests E2E.
- **Database**: sin tareas.
- **Revisión**: los tres agentes revisores al terminar (hito con revisión), con informe en `Revisiones/`.

## Seguimiento de complejidad

| Desviación | Por qué | Alternativa más simple descartada porque |
|---|---|---|
| Tope por número no atómico | El tope es antiabuso blando | Hacerlo atómico exige bloqueo o trigger, que es complejidad desproporcionada para el MVP |
