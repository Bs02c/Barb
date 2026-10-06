import "server-only";
import { dayRangeUtc } from "@/lib/admin/agenda";
import type { AdminBarbershop } from "@/lib/admin/session";
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

export type AgendaAppointment = {
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  status: "active" | "cancelled";
  customerName: string;
  customerPhone: string; // E.164
  barberName: string;
  serviceName: string;
};

/**
 * Citas de un día local de la barbería (todas o de un barbero), ordenadas por hora y con las
 * activas antes que las canceladas. Con la sesión del admin: RLS limita a su barbería.
 */
export async function listAppointmentsForDay(
  barbershop: AdminBarbershop,
  localDate: string,
  barberId?: string,
): Promise<AgendaAppointment[]> {
  const { start, end } = dayRangeUtc(localDate, barbershop.timezone);
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, customer_name, customer_phone, barbers(name), services(name)")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at");
  if (barberId) query = query.eq("barber_id", barberId);
  const { data, error } = await query;
  if (error) throw error;

  return data
    .map((a) => ({
      id: a.id,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      status: a.status,
      customerName: a.customer_name,
      customerPhone: a.customer_phone,
      barberName: a.barbers?.name ?? "",
      serviceName: a.services?.name ?? "",
    }))
    // Misma hora: primero las activas (el orden de Postgres ya es estable por hora).
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || Number(a.status === "cancelled") - Number(b.status === "cancelled"));
}
