import "server-only";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { dayRangeUtc } from "@/lib/admin/agenda";
import type { AdminBarbershop } from "@/lib/admin/session";
import { getVerifiedSession, type VerifiedSession } from "@/lib/auth/session";
import { withAdmin, type Tx } from "@/lib/db/client";
import { appointments, barberBlocks, barberSchedules, barbers, services } from "@/lib/db/schema";

// Lecturas del panel con la identidad del admin: RLS limita a su barbería (no hay filtro por
// barbershop_id en el código a propósito: ADR-017, riesgo aceptado y cubierto por tests).
// Llamar solo después de comprobar getAdminContext(...).status === "ok".

/** Tope defensivo de las listas del panel: ya no existe el max_rows de PostgREST (revisión spec 005, PERF-007). */
const LIST_LIMIT = 500;

export type Barber = { id: string; name: string; is_active: boolean };
export type Service = { id: string; name: string; duration_minutes: number; price: number; is_active: boolean };
export type ScheduleSlot = { id: string; barber_id: string; weekday: number; start_time: string; end_time: string };
export type Block = { id: string; barber_id: string; starts_at: string; ends_at: string; reason: string | null };

/** Ejecuta `fn` con la identidad del admin de esta petición. Sin sesión, error: la página ya debió redirigir. */
async function asAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const session: VerifiedSession | null = await getVerifiedSession();
  if (!session) throw new Error("Lectura del panel sin sesión");
  return withAdmin(session, fn);
}

export async function listBarbers(): Promise<Barber[]> {
  return asAdmin((tx) =>
    tx
      .select({ id: barbers.id, name: barbers.name, is_active: barbers.isActive })
      .from(barbers)
      .orderBy(desc(barbers.isActive), asc(barbers.name))
      .limit(LIST_LIMIT),
  );
}

export async function listServices(): Promise<Service[]> {
  const rows = await asAdmin((tx) =>
    tx
      .select({
        id: services.id,
        name: services.name,
        duration_minutes: services.durationMinutes,
        price: services.price,
        is_active: services.isActive,
      })
      .from(services)
      .orderBy(desc(services.isActive), asc(services.name))
      .limit(LIST_LIMIT),
  );
  return rows.map((s) => ({ ...s, price: Number(s.price) })); // numeric llega como texto
}

/** Tramos del horario semanal (hora local), ordenados por barbero, día y hora. */
export async function listScheduleSlots(): Promise<ScheduleSlot[]> {
  return asAdmin((tx) =>
    tx
      .select({
        id: barberSchedules.id,
        barber_id: barberSchedules.barberId,
        weekday: barberSchedules.weekday,
        start_time: barberSchedules.startTime,
        end_time: barberSchedules.endTime,
      })
      .from(barberSchedules)
      .orderBy(asc(barberSchedules.barberId), asc(barberSchedules.weekday), asc(barberSchedules.startTime))
      .limit(LIST_LIMIT),
  );
}

/** Bloqueos que aún no han terminado (fechas en ISO UTC; mostrar con src/lib/time.ts). */
export async function listUpcomingBlocks(): Promise<Block[]> {
  const rows = await asAdmin((tx) =>
    tx
      .select({
        id: barberBlocks.id,
        barber_id: barberBlocks.barberId,
        starts_at: barberBlocks.startsAt,
        ends_at: barberBlocks.endsAt,
        reason: barberBlocks.reason,
      })
      .from(barberBlocks)
      .where(gte(barberBlocks.endsAt, new Date()))
      .orderBy(asc(barberBlocks.startsAt))
      .limit(LIST_LIMIT),
  );
  return rows.map((b) => ({ ...b, starts_at: b.starts_at.toISOString(), ends_at: b.ends_at.toISOString() }));
}

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
 * activas antes que las canceladas. Con la identidad del admin: RLS limita a su barbería.
 */
export async function listAppointmentsForDay(
  barbershop: AdminBarbershop,
  localDate: string,
  barberId?: string,
): Promise<AgendaAppointment[]> {
  const { start, end } = dayRangeUtc(localDate, barbershop.timezone);
  const rows = await asAdmin((tx) =>
    tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        customerName: appointments.customerName,
        customerPhone: appointments.customerPhone,
        barberName: barbers.name,
        serviceName: services.name,
      })
      .from(appointments)
      .leftJoin(barbers, eq(barbers.id, appointments.barberId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          gte(appointments.startsAt, new Date(start)),
          lt(appointments.startsAt, new Date(end)),
          barberId ? eq(appointments.barberId, barberId) : undefined,
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(LIST_LIMIT), // un día de una barbería no llega ni de lejos
  );

  return rows
    .map((a) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      barberName: a.barberName ?? "",
      serviceName: a.serviceName ?? "",
    }))
    // Misma hora: primero las activas (el orden de Postgres ya es estable por hora).
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || Number(a.status === "cancelled") - Number(b.status === "cancelled"));
}
