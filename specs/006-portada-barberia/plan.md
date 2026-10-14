# Plan de implementación: portada de la barbería y estilo oscuro

**Rama**: `006-portada-barberia` | **Fecha**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Entrada**: spec 006 aprobada por el usuario el 2026-10-14; `DESIGN.md` 0.2.0 aprobado el mismo día.

## Resumen

La página principal de cada barbería pasa a ser una portada con sus servicios, el horario y los datos del local, y toda la app adopta el tema oscuro con cobre de `DESIGN.md` 0.2.0.

Técnicamente:
- **Base de datos:** una migración añade tres columnas de texto opcionales con `check`, más un privilegio de columna y una política RLS de UPDATE para que el admin modifique solo `description` y `address` de su barbería.
- **Horario:** se deriva de los horarios de los barberos activos, dentro de la transacción del catálogo que ya existe (sin consultas extra).
- **Tema:** se cambian los tokens de `globals.css`.
- **Panel:** gana la sección "Mi barbería" y el campo de descripción en servicios.

Detalle de cada decisión en [research.md](research.md).

## Contexto técnico

- **Lenguaje/versión:** TypeScript estricto, Node 24, Next.js 16 (App Router).
- **Dependencias principales:** Tailwind CSS + shadcn/ui, Zod, Drizzle (solo como constructor de consultas), `pg`, Better Auth y Lucide. **No se añade ninguna dependencia.**
- **Almacenamiento:** PostgreSQL 17 propio, con migraciones dbmate y RLS con roles propios (ADR-017).
- **Tests:**
  - Vitest para unitarios: `hours.ts` y los esquemas;
  - pgTAP para la matriz de privilegios, el aislamiento del UPDATE y las restricciones;
  - Vitest de integración con la conexión real de la app;
  - Playwright con `axe`.
- **Plataforma:** web en el navegador del celular primero; en el VPS con Docker Compose (fase 7).
- **Tipo de proyecto:** aplicación web, un solo proyecto Next.js.
- **Rendimiento:** la portada no supera en más de un 10 % el TTFB de `/reservar` (SC-005). Se mantienen dos transacciones por petición (barbería y catálogo).
- **Restricciones:**
  - sin imágenes ni almacenamiento de archivos;
  - sin caché de datos (el estado de apertura depende de la hora);
  - textos en `es-CO`;
  - la hora se calcula en la zona de la barbería.
- **Escala:** decenas de barberías y, por barbería, menos de 50 servicios y 20 barberos.

## Comprobación de la constitución

| Principio | Cómo se cumple | Estado |
|---|---|---|
| I. Aislamiento | Columnas en tablas que ya tienen `barbershop_id` y RLS. UPDATE de `barbershops` decidido por rol (tabla "Resultado por actor" de `data-model.md`), comentado en la migración y probado en pgTAP y en integración con `app_login`. La portada resuelve la barbería por el Host. `service_role` filtra por `barbershop.id`. | ✅ |
| II. Secretos | Sin secretos nuevos. La portada sigue en el servidor. | ✅ |
| III. La base, última barrera | `check` de longitud, espacios y saltos de línea en la base, además de Zod. El privilegio de columna impide tocar otros campos. | ✅ |
| IV. UTC y zona | La hora local de "ahora" se obtiene solo con `src/lib/time.ts`. Los horarios ya son hora local del día. | ✅ |
| V. Validación | Esquemas Zod compartidos por el formulario y la acción. | ✅ |
| VI. Datos personales | La dirección y la descripción son datos del negocio, no del cliente. Sin logs nuevos con datos. | ✅ |
| VII. Simplicidad | Sin dependencias, servicios ni tablas nuevas. Fuera: fotos, reseñas y "lo más pedido" (Roadmap). | ✅ |
| VIII. Portabilidad | Sin servicios de hosting. El enlace a Google Maps es un enlace normal, sin API. | ✅ |
| Preguntar primero (esquema y RLS) | El usuario aprobó el cambio de permisos al elegir que el admin edite los datos ("Mi barbería") y al aprobar la spec. | ✅ |
| Revisión | Hito de modelo de datos y RLS: revisión de los tres agentes antes de fusionar. | Pendiente (tareas) |

Sin violaciones; la tabla de complejidad no aplica. **Revisión tras el diseño:** el diseño de la fase 1 no añade nada que cambie esta tabla.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/006-portada-barberia/
├── spec.md
├── plan.md              # este archivo
├── research.md          # decisiones R1–R10
├── data-model.md        # columnas, privilegios, política y resultado por actor
├── quickstart.md        # validación automática y manual
├── contracts/
│   ├── data-access.md   # funciones y tipos entre la capa de servidor y las páginas
│   └── ui.md            # portada, tema, panel y E2E
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código

```text
db/
├── migrations/0002_portada_barberia.sql            # database
├── seed.sql                                        # database: descripción y dirección de La Barbería
└── tests/00_structure, 01_isolation, 04_constraints # database

src/lib/                                            # agente principal
├── storefront/hours.ts (+ hours.test.ts)           # nuevo: horario, estado de apertura, enlace al mapa
├── time.ts                                         # hora local HH:MM de un instante, si falta
├── barbershops.ts                                  # description y address
├── booking/queries.ts                              # description de servicio y weeklyHours
├── admin/queries.ts, actions.ts, schemas.ts        # "Mi barbería" y descripción de servicio
└── db/schema.ts                                    # columnas nuevas

src/app/ y src/components/                          # frontend
├── globals.css                                     # tema oscuro
├── s/[subdomain]/page.tsx                          # portada
├── s/[subdomain]/admin/(panel)/mi-barberia/page.tsx
└── components/storefront/*, admin/admin-nav.tsx, admin/services-manager.tsx, admin/barbershop-form.tsx

tests/
├── integration/                                    # agente principal
└── e2e/                                            # frontend
```

**Decisión de estructura:** se sigue la de `CLAUDE.md`. El único módulo nuevo es `src/lib/storefront/`, con la lógica pura de la portada, separada de la reserva (`booking/`) porque no reserva nada.

## Orden de trabajo y paralelismo

1. **Base (database):** migración, pgTAP y seed. En paralelo, el agente principal hace `hours.ts` con sus tests unitarios y el `frontend` aplica el tema oscuro a `globals.css` y los componentes existentes.
2. **Capa de servidor (agente principal):** `schema.ts`, consultas, acciones, esquemas y tests de integración, según `contracts/data-access.md`.
3. **Páginas (frontend):** portada, "Mi barbería", campo de descripción en servicios y E2E, según `contracts/ui.md`.
4. **Integración y verificación completa:** lint, typecheck, test, `db:reset`, `test:db`, `test:integration`, `test:e2e`, build y TTFB.
5. **Revisión de los tres agentes** (hito de modelo de datos y RLS), correcciones, vault, commit y fusión.
