import "server-only";
import { createClient } from "@/lib/supabase/server";

// Lecturas del panel con la sesión del admin: RLS limita a su barbería.
// Llamar solo después de comprobar getAdminContext(...).status === "ok".

export async function listBarbers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .select("id, name, is_active")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw error;
  return data;
}

export async function listServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price, is_active")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw error;
  return data;
}

/** Tramos del horario semanal (hora local), ordenados por barbero, día y hora. */
export async function listScheduleSlots() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barber_schedules")
    .select("id, barber_id, weekday, start_time, end_time")
    .order("barber_id")
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return data;
}

/** Bloqueos que aún no han terminado (fechas en UTC; mostrar con src/lib/time.ts). */
export async function listUpcomingBlocks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barber_blocks")
    .select("id, barber_id, starts_at, ends_at, reason")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  return data;
}

export type Barber = Awaited<ReturnType<typeof listBarbers>>[number];
export type Service = Awaited<ReturnType<typeof listServices>>[number];
export type ScheduleSlot = Awaited<ReturnType<typeof listScheduleSlots>>[number];
export type Block = Awaited<ReturnType<typeof listUpcomingBlocks>>[number];
