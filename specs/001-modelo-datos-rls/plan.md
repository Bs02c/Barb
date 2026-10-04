# Plan de implementación: modelo de datos y aislamiento por barbería

**Rama**: `001-modelo-datos-rls` | **Fecha**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Entrada**: spec aprobada por el usuario el 2026-10-04.

## Resumen

Esquema de Postgres en Supabase para el MVP:
- Siete tablas (`barbershops`, `profiles`, `barbers`, `services`, `barber_schedules`, `barber_blocks`, `appointments`), con `barbershop_id` y RLS en todas.
- Claves foráneas compuestas que impiden referencias entre barberías.
- Una restricción de exclusión contra citas solapadas.
- Fechas en UTC con zona horaria por barbería.

Se entrega con datos de demostración en local, tests pgTAP y un test de concurrencia. Detalle en [research.md](research.md), [data-model.md](data-model.md) y [contracts/acceso-por-rol.md](contracts/acceso-por-rol.md).

## Contexto técnico

**Lenguaje/Versión**: SQL (PostgreSQL 17.11 en Supabase local); TypeScript 5 para tipos y el test de integración

**Dependencias principales**: Supabase CLI 2.119, extensiones `btree_gist`, `pgcrypto` y `pgtap`

**Almacenamiento**: PostgreSQL (Supabase)

**Testing**: pgTAP (`npm run test:db`); Vitest para el test de concurrencia (`npm run test:integration`)

**Plataforma**: Supabase local en Docker (desarrollo); Supabase en la nube (pruebas y producción, ADR-014)

**Tipo de proyecto**: aplicación web (Next.js), aquí solo la capa de datos

**Objetivos de rendimiento**: consultas de una barbería por `barbershop_id` y por rango de fechas con índice; políticas RLS evaluadas una vez por consulta

**Restricciones**: plan gratuito de Supabase; código portable (sin nada exclusivo del hosting)

**Escala**: decenas o cientos de barberías, pocos barberos cada una, cientos de citas al mes por barbería

## Verificación de la constitución

| Principio | Cumplimiento |
|---|---|
| I. Aislamiento | `barbershop_id` y RLS en todas las tablas; cada operación decidida por rol (con política o denegada por ausencia, documentada en el contrato y en la migración, y probada; constitución 1.1.1 tras la revisión MAINT-001); FK compuestas; tests de aislamiento por tabla ✅ |
| II. Secretos | Sin código de cliente en esta fase; `anon` sin privilegios ✅ |
| III. Integridad en la base de datos | Exclusión de citas y tramos, `check` de formatos, duración y estado ✅. Horario y bloqueos frente a citas: diferido a la fase 4 y justificado en research §5 |
| IV. UTC | `timestamptz`; zona validada por barbería; horarios en hora local documentados ✅ |
| V. Validación | `check` en la base de datos como última barrera; Zod llega con los formularios ✅ |
| VI. Datos personales | Solo nombre, teléfono y correo; consentimiento obligatorio con fecha; índices para localizar y borrar ✅ |
| VII. Simplicidad | Sin token de cancelación, sin moneda, sin ficha de cliente, sin `updated_at` (se añaden cuando hagan falta) ✅ |
| VIII. Portabilidad | Solo Postgres y Supabase ✅ |
| Límites | Esquema y RLS: se presenta este plan al usuario antes de implementar ("Preguntar primero") ✅. Seed y tests solo en local (ADR-014) ✅ |

**Resultado**: pasa. Una desviación justificada (research §5).

## Estructura del proyecto

### Documentación

```text
specs/001-modelo-datos-rls/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/acceso-por-rol.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Código

```text
supabase/
├── migrations/
│   ├── <ts>_extensions_and_helpers.sql   # btree_gist, schema private, tipos, funciones auxiliares
│   ├── <ts>_tenancy.sql                  # barbershops, profiles + RLS
│   ├── <ts>_catalog.sql                  # barbers, services, barber_schedules, barber_blocks + RLS
│   └── <ts>_appointments.sql             # appointments + exclusión + RLS
├── seed.sql                              # dos barberías de demostración y super admin (solo local)
└── tests/
    ├── 00_helpers.test.sql               # comprobaciones de estructura (RLS activo, anon sin privilegios)
    ├── 01_isolation.test.sql             # historia 1
    ├── 02_overlap.test.sql               # historia 2
    ├── 03_timezone.test.sql              # historia 3
    └── 04_constraints.test.sql           # historia 4 y casos límite
tests/integration/
└── appointments-concurrency.test.ts      # SC-002 (dos inserciones en paralelo)
src/lib/database.types.ts                 # generado
```

**Decisión de estructura**: una migración por grupo de tablas relacionadas, cada una con sus políticas (constitución, principio I). La de citas va aparte porque depende de las demás y es la más delicada.

## Ejecución

- **Agente `database`**: migraciones, seed y tests pgTAP (todo dentro de `supabase/`).
- **Agente principal**: test de integración, scripts de npm (`test:integration`, `db:types`), tipos generados, revisión del reporte del agente, integración y explicación al usuario.
- **Revisión**: los tres agentes revisores al terminar (hito con revisión). Informe en `Revisiones/` del vault.
- **Paralelismo**: ninguno real; el test de integración depende de la migración de citas.

## Seguimiento de complejidad

| Desviación | Por qué | Alternativa más simple descartada porque |
|---|---|---|
| Validar horario y bloqueos de una cita fuera de la base de datos (fase 4) | Expresarlo como restricción exige triggers que consultan otras tablas | Un trigger así es difícil de mantener y de probar; la función de reserva de la fase 4 lo valida con tests |
| Test de concurrencia en Vitest además de pgTAP | pgTAP corre en una sola sesión y no puede simular dos transacciones simultáneas | Sin él, SC-002 quedaría sin probar |
