# Plan de ejecución: fase 6, agenda del admin

**Rama**: `004-agenda-admin` (fusionar en `main` al cerrar) | **Fecha**: 2026-10-06 | **Estado**: pendiente de aprobación del usuario

**Sin spec de Spec Kit**: la agenda no es una funcionalidad delicada según la constitución. La base de datos ya permite al admin leer y cancelar sus citas: RLS y permisos por columna están probados en `supabase/tests/01_isolation.test.sql`. **Sin revisión de los tres agentes**: no es un hito con revisión (sí lo es la fase 7).

**Listo cuando:**
- el admin ve las citas de un día, de todos los barberos o de uno;
- puede cancelar una cita que aún no ha empezado;
- la hora cancelada vuelve a ofrecerse en `/reservar`.

## Decisiones propuestas (aprobar antes de ejecutar)

1. **La agenda es la página de inicio del panel** (`/admin`). El inicio actual repite los enlaces que ya están en la navegación. Así la barra inferior del móvil sigue con 5 secciones más "Salir", sin una sexta.
   - El ítem "Inicio" pasa a llamarse **"Agenda"**, con el icono `CalendarDays`.
   - El aviso "para recibir reservas necesitas un barbero activo con horario y un servicio activo" se mantiene arriba de la agenda cuando aplica.
2. **Día por URL**: `?dia=YYYY-MM-DD` (fecha local de la barbería); por defecto, hoy.
   - **Navegación**: enlaces "Día anterior" y "Día siguiente", y un `<input type="date">` en un formulario GET.
   - **Filtro**: `?barbero=<uuid>` opcional; por defecto, todos ("Todos los barberos").
3. **Columnas** (DESIGN.md, "Agenda"): Hora (inicio–fin), Barbero, Cliente (nombre + número con enlace `tel:`), Servicio, Estado (Activa / Cancelada) y acción.
   - Las canceladas se muestran atenuadas, después de las activas de su misma hora.
   - El correo del cliente no se muestra en la tabla: se mantienen los datos personales mínimos en pantalla.
4. **Cancelar desde el panel**: solo citas activas que aún no han empezado, con confirmación ("¿Cancelar la cita de Carlos a las 10:00?").
   - El servidor lo exige: si la cita ya empezó o ya estaba cancelada, responde "Esta cita ya no se puede cancelar."
   - **Sin correo al cliente**: está fuera del MVP (spec 003); el admin le avisa por teléfono.
5. **Actualización**: al recargar la página o después de cancelar (`revalidatePath`). Sin tiempo real (Roadmap).

## Arquitectura

- **Lectura**: con la **sesión del admin** (`src/lib/supabase/server.ts`, RLS), igual que el resto del panel. Nunca con la clave secreta.
  - Un día local se convierte a un rango UTC `[inicio, fin)` con `src/lib/time.ts` (constitución IV).
  - Una consulta por página: citas del rango, ordenadas por hora, con `barbers(name)` y `services(name)` embebidos.
  - Índice existente: `appointments_barbershop_id_starts_at_idx`.
- **Escritura**: server action `adminCancelAppointment` en `src/lib/admin/actions.ts`, con el mismo patrón que las demás (`requireAdmin` → Zod → sesión → `fromDatabase` → `refresh`).
  - Es un `UPDATE` condicionado con las condiciones `id`, `status = 'active'` y `starts_at > now`, que devuelve las filas afectadas. 0 filas → mensaje de "ya no se puede cancelar".
- **Base de datos**: sin cambios.

## Contrato (lo publica el principal en T002; el frontend programa contra él)

```ts
// src/lib/admin/schemas.ts (compartido)
export const agendaParamsSchema: z.ZodType<{ dia?: string; barbero?: string }>;
// dia: /^\d{4}-\d{2}-\d{2}$/ y fecha real; barbero: uuid. Valor inválido → se ignora (undefined), nunca error.

// src/lib/admin/agenda.ts (puro, sin server-only; con test)
export function dayRangeUtc(localDate: string, timeZone: string): { start: string; end: string }; // ISO UTC, [start, end)

// src/lib/admin/queries.ts (server-only, sesión del admin)
export async function listAppointmentsForDay(
  barbershop: AdminBarbershop,
  localDate: string,
  barberId?: string,
): Promise<AgendaAppointment[]>;
export type AgendaAppointment = {
  id: string;
  startsAt: string;          // ISO UTC
  endsAt: string;            // ISO UTC
  status: "active" | "cancelled";
  customerName: string;
  customerPhone: string;     // E.164
  barberName: string;
  serviceName: string;
};

// src/lib/admin/actions.ts ("use server")
/** formData: id. Cancela si es de esta barbería (RLS), está activa y no ha empezado. */
export async function adminCancelAppointment(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState>;
```

Formato en pantalla: `formatTime(instant, barbershop.timezone)` y `formatLocalDate(localDate)` de `src/lib/time.ts`. Hoy local: `toLocalDate(new Date(), barbershop.timezone)`.

## Reparto entre agentes (todos con Sonnet 5.5)

| Agente | Qué hace | Tareas |
|---|---|---|
| **Principal** (la sesión) | Rama, contrato, esquema, rango de día, consulta, server action, tests unitarios, integración final, vault y commit | T001–T004, T008–T009 |
| **frontend** | Página de agenda en `/admin`, componente de la tabla con cancelación, navegación, test E2E | T005–T007 |
| **database** | **Sin tareas.** Los permisos y la RLS de la cita ya están probados. Solo se le asigna algo si la integración descubre un fallo en `supabase/` | — |

**Orden**: T001 → T002 (contrato) → en paralelo, {T003–T004 principal} y {T005–T006 frontend} → T007 (E2E, necesita ambos) → T008 → T009.

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Cita de las 23:30 hora local que cae en el día UTC siguiente | Test unitario de `dayRangeUtc` con `America/Bogota` |
| Admin de otra barbería cancela por id | RLS (`appointments_update` por `barbershop_id`), ya probado en pgTAP; la acción usa la sesión, no la clave secreta |
| Cancelar una cita pasada o ya cancelada | `UPDATE` condicionado + mensaje; E2E de la cita futura |
| `?dia` o `?barbero` manipulados | `agendaParamsSchema`: un valor inválido se ignora y se muestra hoy o todos |
| Datos personales en pantalla o en logs | Solo nombre y número; los errores van por `fromDatabase`, con código y mensaje |
