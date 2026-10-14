"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import type { ActionState } from "@/lib/admin/action-state";
import {
  activeSchema,
  barberSchema,
  barbershopInfoSchema,
  blockSchema,
  idSchema,
  scheduleSlotSchema,
  serviceSchema,
} from "@/lib/admin/schemas";
import { getAdminContext, type AdminBarbershop } from "@/lib/admin/session";
import { getAuth } from "@/lib/auth/auth";
import type { VerifiedSession } from "@/lib/auth/session";
import { withAdmin, type Tx } from "@/lib/db/client";
import { toDbError } from "@/lib/db/errors";
import { appointments, barberBlocks, barberSchedules, barbers, barbershops, services } from "@/lib/db/schema";
import { logSafeError } from "@/lib/log";
import { localDateTimeToUtc } from "@/lib/time";
import { toFieldErrors } from "@/lib/validation";

// Server actions del panel. Todas:
// 1. comprueban la sesión y que el admin pertenece a la barbería del subdominio;
// 2. validan con los esquemas Zod compartidos;
// 3. escriben con withAdmin, la identidad del admin (RLS decide; nunca con withService);
// 4. traducen los errores de Postgres a mensajes en español (por código, con toDbError).
// Uso desde un formulario: `useActionState(createBarber.bind(null, subdomain), initialState)`,
// con `initialState` de src/lib/admin/action-state.ts.

type FieldSchema = z.ZodType<unknown, Record<string, FormDataEntryValue>>;

function parseForm<S extends FieldSchema>(schema: S, formData: FormData) {
  return schema.safeParse(Object.fromEntries(formData)) as z.ZodSafeParseResult<z.output<S>>;
}

function invalid(error: z.ZodError): ActionState {
  return { ok: false, message: "Revisa los campos marcados.", fieldErrors: toFieldErrors(error) };
}

// Códigos documentados en specs/001-modelo-datos-rls/contracts/acceso-por-rol.md.
function fromDatabase(error: unknown): ActionState {
  switch (toDbError(error)?.code) {
    case "23P01":
      return { ok: false, message: "Ese tramo se cruza con otro del mismo barbero ese día." };
    case "23503":
      return {
        ok: false,
        message: "Tiene citas registradas: desactívalo en lugar de borrarlo.",
      };
    case "23514":
      return { ok: false, message: "Algún dato no es válido. Revisa el formulario." };
    case "42501":
      return { ok: false, message: "No tienes permiso para hacer esto." };
    default:
      logSafeError("Error de base de datos en el panel", error);
      return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

/** Sesión válida de admin de esta barbería (y su identidad para withAdmin), o redirige al login. */
async function requireAdmin(subdomain: string): Promise<{ session: VerifiedSession; barbershop: AdminBarbershop }> {
  const context = await getAdminContext(subdomain);
  if (context.status !== "ok") redirect("/admin/login");
  return { session: context.session, barbershop: context.barbershop };
}

/** Ejecuta una escritura con la identidad del admin; devuelve el error traducido o null si fue bien. */
async function write(session: VerifiedSession, fn: (tx: Tx) => Promise<unknown>): Promise<ActionState | null> {
  try {
    await withAdmin(session, fn);
    return null;
  } catch (error) {
    return fromDatabase(error);
  }
}

/**
 * Revalida el panel y la portada pública, que muestra servicios, horario y datos de la barbería. Hoy la
 * portada se genera en cada petición; esto la mantiene al día si algún día se cachea (spec 006, MAINT-004).
 */
function refresh(subdomain: string) {
  revalidatePath(`/s/${subdomain}/admin`, "layout");
  revalidatePath(`/s/${subdomain}`);
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

/**
 * Segundo paso del login. El primero es el POST del formulario a /api/auth/sign-in/email (Better Auth:
 * comprueba la contraseña, aplica el límite de intentos y fija la cookie; ADR-017, enmienda 1).
 * Aquí se exige que la cuenta sea admin de ESTA barbería; si no, se cierra la sesión recién abierta.
 */
export async function confirmPanelAccess(subdomain: string): Promise<ActionState> {
  const context = await getAdminContext(subdomain);
  if (context.status !== "ok") {
    if (context.status === "anonymous") return { ok: false, message: "Correo o contraseña incorrectos." };
    // Solo esta sesión (la de este navegador en este subdominio): no toca otras sesiones del usuario.
    await getAuth().api.signOut({ headers: await headers() });
    return {
      ok: false,
      message:
        context.status === "inactive"
          ? "Esta barbería está desactivada. Contacta con el soporte de la plataforma."
          : "Esta cuenta no tiene acceso al panel de esta barbería.",
    };
  }
  redirect("/admin");
}

export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() }); // solo esta sesión; borra la cookie (nextCookies)
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Barberos
// ---------------------------------------------------------------------------

export async function createBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, barbershop } = await requireAdmin(subdomain);
  const parsed = parseForm(barberSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) =>
    tx.insert(barbers).values({ barbershopId: barbershop.id, name: parsed.data.name }),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Barbero añadido." };
}

/** formData: id, name */
export async function renameBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const id = parseForm(idSchema, formData);
  const parsed = parseForm(barberSchema, formData);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) =>
    tx.update(barbers).set({ name: parsed.data.name }).where(eq(barbers.id, id.data.id)),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Barbero actualizado." };
}

/** formData: id, is_active ("true" | "false") */
export async function setBarberActive(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(activeSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) =>
    tx.update(barbers).set({ isActive: parsed.data.is_active }).where(eq(barbers.id, parsed.data.id)),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: parsed.data.is_active ? "Barbero activado." : "Barbero desactivado." };
}

/** formData: id. Falla con mensaje claro si tiene citas (23503). */
export async function deleteBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) => tx.delete(barbers).where(eq(barbers.id, parsed.data.id)));
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Barbero eliminado." };
}

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

export async function createService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, barbershop } = await requireAdmin(subdomain);
  const parsed = parseForm(serviceSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const { name, duration_minutes, price, description } = parsed.data;
  const failed = await write(session, (tx) =>
    tx
      .insert(services)
      .values({ barbershopId: barbershop.id, name, durationMinutes: duration_minutes, price: String(price), description }),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Servicio añadido." };
}

/** formData: id, name, duration_minutes, price, description (opcional; vacío la quita) */
export async function updateService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const id = parseForm(idSchema, formData);
  const parsed = parseForm(serviceSchema, formData);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);

  const { name, duration_minutes, price, description } = parsed.data;
  const failed = await write(session, (tx) =>
    tx
      .update(services)
      .set({ name, durationMinutes: duration_minutes, price: String(price), description })
      .where(eq(services.id, id.data.id)),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Servicio actualizado." };
}

/** formData: id, is_active ("true" | "false") */
export async function setServiceActive(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(activeSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) =>
    tx.update(services).set({ isActive: parsed.data.is_active }).where(eq(services.id, parsed.data.id)),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: parsed.data.is_active ? "Servicio activado." : "Servicio desactivado." };
}

/** formData: id. Falla con mensaje claro si tiene citas (23503). */
export async function deleteService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) => tx.delete(services).where(eq(services.id, parsed.data.id)));
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Servicio eliminado." };
}

// ---------------------------------------------------------------------------
// Mi barbería (spec 006)
// ---------------------------------------------------------------------------

/**
 * formData: description, address (opcionales; vacío los quita de la portada).
 * Solo esas dos columnas: el privilegio de columna de la base rechaza cualquier otra (42501) y la
 * política barbershops_update limita la fila a la barbería del admin. El filtro por barbershop.id es
 * defensa en profundidad; si no se actualiza ninguna fila, no tiene permiso.
 */
export async function updateBarbershopInfo(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, barbershop } = await requireAdmin(subdomain);
  const parsed = parseForm(barbershopInfoSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  let updated = 0;
  const failed = await write(session, async (tx) => {
    const rows = await tx
      .update(barbershops)
      .set({ description: parsed.data.description, address: parsed.data.address })
      .where(eq(barbershops.id, barbershop.id))
      .returning({ id: barbershops.id });
    updated = rows.length;
  });
  if (failed) return failed;
  if (updated === 0) return { ok: false, message: "No tienes permiso para hacer esto." };
  refresh(subdomain);
  return { ok: true, message: "Datos guardados." };
}

// ---------------------------------------------------------------------------
// Horario semanal (hora local de la barbería; no se convierte a UTC)
// ---------------------------------------------------------------------------

/** formData: barber_id, weekday (1–7), start_time "HH:MM", end_time "HH:MM" */
export async function addScheduleSlot(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, barbershop } = await requireAdmin(subdomain);
  const parsed = parseForm(scheduleSlotSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const { barber_id, weekday, start_time, end_time } = parsed.data;
  const failed = await write(session, (tx) =>
    tx.insert(barberSchedules).values({
      barbershopId: barbershop.id,
      barberId: barber_id,
      weekday,
      startTime: start_time,
      endTime: end_time,
    }),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Tramo añadido." };
}

/** formData: id */
export async function deleteScheduleSlot(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) => tx.delete(barberSchedules).where(eq(barberSchedules.id, parsed.data.id)));
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Tramo eliminado." };
}

// ---------------------------------------------------------------------------
// Bloqueos (fecha y hora local de la barbería → UTC con src/lib/time.ts)
// ---------------------------------------------------------------------------

/** formData: barber_id, starts_at y ends_at "YYYY-MM-DDTHH:MM" (hora local), reason opcional */
export async function addBlock(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, barbershop } = await requireAdmin(subdomain);
  const parsed = parseForm(blockSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const { barber_id, starts_at, ends_at, reason } = parsed.data;
  const failed = await write(session, (tx) =>
    tx.insert(barberBlocks).values({
      barbershopId: barbershop.id,
      barberId: barber_id,
      startsAt: localDateTimeToUtc(starts_at, barbershop.timezone),
      endsAt: localDateTimeToUtc(ends_at, barbershop.timezone),
      reason: reason || null,
    }),
  );
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Bloqueo añadido." };
}

/** formData: id */
export async function deleteBlock(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const failed = await write(session, (tx) => tx.delete(barberBlocks).where(eq(barberBlocks.id, parsed.data.id)));
  if (failed) return failed;
  refresh(subdomain);
  return { ok: true, message: "Bloqueo eliminado." };
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

/** formData: id. Cancela una cita de esta barbería que está activa y aún no ha empezado. */
export async function adminCancelAppointment(
  subdomain: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  // Una sola sentencia condicionada: RLS limita a las citas de su barbería y el servidor exige que
  // esté activa y no haya empezado. 0 filas = otra pestaña o el cliente ya la cancelaron, o ya empezó.
  const now = new Date();
  let cancelled: { id: string }[];
  try {
    cancelled = await withAdmin(session, (tx) =>
      tx
        .update(appointments)
        .set({ status: "cancelled", cancelledAt: now })
        .where(and(eq(appointments.id, parsed.data.id), eq(appointments.status, "active"), gt(appointments.startsAt, now)))
        .returning({ id: appointments.id }),
    );
  } catch (error) {
    return fromDatabase(error);
  }
  if (cancelled.length === 0) return { ok: false, message: "Esta cita ya no se puede cancelar." };
  refresh(subdomain);
  return { ok: true, message: "Cita cancelada." };
}
