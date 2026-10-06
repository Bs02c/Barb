"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import type { ActionState } from "@/lib/admin/action-state";
import { getAdminContext, type AdminBarbershop } from "@/lib/admin/session";
import {
  activeSchema,
  barberSchema,
  blockSchema,
  idSchema,
  loginSchema,
  scheduleSlotSchema,
  serviceSchema,
} from "@/lib/admin/schemas";
import { createClient } from "@/lib/supabase/server";
import { localDateTimeToUtc } from "@/lib/time";
import { toFieldErrors } from "@/lib/validation";

// Server actions del panel. Todas:
// 1. comprueban la sesión y que el admin pertenece a la barbería del subdominio;
// 2. validan con los esquemas Zod compartidos;
// 3. escriben con la sesión del admin (RLS decide; nunca con la clave secreta);
// 4. traducen los errores de Postgres a mensajes en español.
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
function fromDatabase(error: PostgrestError): ActionState {
  switch (error.code) {
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
      console.error("Error de base de datos en el panel", { code: error.code, message: error.message });
      return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

/** Sesión válida de admin de esta barbería, o redirige al login. */
async function requireAdmin(subdomain: string): Promise<AdminBarbershop> {
  const context = await getAdminContext(subdomain);
  if (context.status !== "ok") redirect("/admin/login");
  return context.barbershop;
}

function refresh(subdomain: string) {
  revalidatePath(`/s/${subdomain}/admin`, "layout");
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export async function signIn(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Mismo mensaje para correo inexistente y contraseña errónea: no revela qué cuentas existen.
  if (error) return { ok: false, message: "Correo o contraseña incorrectos." };

  const context = await getAdminContext(subdomain);
  if (context.status !== "ok") {
    // "local": solo esta sesión; equivocarse de subdominio no cierra su sesión en su propio panel.
    await supabase.auth.signOut({ scope: "local" });
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
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }); // solo este navegador
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Barberos
// ---------------------------------------------------------------------------

export async function createBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const barbershop = await requireAdmin(subdomain);
  const parsed = parseForm(barberSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("barbers").insert({ barbershop_id: barbershop.id, ...parsed.data });
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Barbero añadido." };
}

/** formData: id, name */
export async function renameBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const id = parseForm(idSchema, formData);
  const parsed = parseForm(barberSchema, formData);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("barbers").update(parsed.data).eq("id", id.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Barbero actualizado." };
}

/** formData: id, is_active ("true" | "false") */
export async function setBarberActive(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(activeSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("barbers")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: parsed.data.is_active ? "Barbero activado." : "Barbero desactivado." };
}

/** formData: id. Falla con mensaje claro si tiene citas (23503). */
export async function deleteBarber(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("barbers").delete().eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Barbero eliminado." };
}

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

export async function createService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const barbershop = await requireAdmin(subdomain);
  const parsed = parseForm(serviceSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ barbershop_id: barbershop.id, ...parsed.data });
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Servicio añadido." };
}

/** formData: id, name, duration_minutes, price */
export async function updateService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const id = parseForm(idSchema, formData);
  const parsed = parseForm(serviceSchema, formData);
  if (!id.success) return invalid(id.error);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("services").update(parsed.data).eq("id", id.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Servicio actualizado." };
}

/** formData: id, is_active ("true" | "false") */
export async function setServiceActive(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(activeSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: parsed.data.is_active ? "Servicio activado." : "Servicio desactivado." };
}

/** formData: id. Falla con mensaje claro si tiene citas (23503). */
export async function deleteService(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Servicio eliminado." };
}

// ---------------------------------------------------------------------------
// Horario semanal (hora local de la barbería; no se convierte a UTC)
// ---------------------------------------------------------------------------

/** formData: barber_id, weekday (1–7), start_time "HH:MM", end_time "HH:MM" */
export async function addScheduleSlot(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const barbershop = await requireAdmin(subdomain);
  const parsed = parseForm(scheduleSlotSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("barber_schedules")
    .insert({ barbershop_id: barbershop.id, ...parsed.data });
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Tramo añadido." };
}

/** formData: id */
export async function deleteScheduleSlot(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("barber_schedules").delete().eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Tramo eliminado." };
}

// ---------------------------------------------------------------------------
// Bloqueos (fecha y hora local de la barbería → UTC con src/lib/time.ts)
// ---------------------------------------------------------------------------

/** formData: barber_id, starts_at y ends_at "YYYY-MM-DDTHH:MM" (hora local), reason opcional */
export async function addBlock(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const barbershop = await requireAdmin(subdomain);
  const parsed = parseForm(blockSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const { barber_id, starts_at, ends_at, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("barber_blocks").insert({
    barbershop_id: barbershop.id,
    barber_id,
    starts_at: localDateTimeToUtc(starts_at, barbershop.timezone).toISOString(),
    ends_at: localDateTimeToUtc(ends_at, barbershop.timezone).toISOString(),
    reason: reason || null,
  });
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Bloqueo añadido." };
}

/** formData: id */
export async function deleteBlock(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin(subdomain);
  const parsed = parseForm(idSchema, formData);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("barber_blocks").delete().eq("id", parsed.data.id);
  if (error) return fromDatabase(error);
  refresh(subdomain);
  return { ok: true, message: "Bloqueo eliminado." };
}
