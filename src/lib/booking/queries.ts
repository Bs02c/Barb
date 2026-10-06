import "server-only";
import { cache } from "react";
import type { PublicBarbershop } from "@/lib/barbershops";
import { createServiceClient } from "@/lib/supabase/service";
import { addDaysToLocalDate, formatLocalDate, formatPrice, localDateTimeToUtc, toLocalDate } from "@/lib/time";
import { computeAvailableSlots, HORIZON_DAYS, type AvailableSlot } from "./availability";
import { EARLIEST } from "./schemas";

// Lecturas de la reserva pública con la clave secreta (el cliente no tiene sesión).
// Constitución I: TODA consulta filtra por barbershop.id, que viene de getPublicBarbershop(subdomain);
// nunca de un parámetro del cliente. Los ids de servicio y barbero se buscan dentro de esa barbería.

export type CatalogService = { id: string; name: string; durationMinutes: number; price: number; priceLabel: string };
export type CatalogBarber = { id: string; name: string };

/**
 * Servicios y barberos activos de la barbería (pasos 1 y 2).
 * `cache` evita repetir la consulta en la misma petición: la página y getAvailability la piden
 * con el mismo objeto barbershop (también cacheado por petición).
 */
export const getBookingCatalog = cache(async (barbershop: PublicBarbershop) => {
  const db = createServiceClient();
  const [services, barbers, schedules] = await Promise.all([
    db
      .from("services")
      .select("id, name, duration_minutes, price")
      .eq("barbershop_id", barbershop.id)
      .eq("is_active", true)
      .order("name"),
    db.from("barbers").select("id, name").eq("barbershop_id", barbershop.id).eq("is_active", true).order("name"),
    db.from("barber_schedules").select("barber_id").eq("barbershop_id", barbershop.id),
  ]);
  if (services.error) throw services.error;
  if (barbers.error) throw barbers.error;
  if (schedules.error) throw schedules.error;

  const activeBarberIds = new Set(barbers.data.map((b) => b.id));

  return {
    services: services.data.map(
      (s): CatalogService => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.duration_minutes,
        price: Number(s.price),
        priceLabel: formatPrice(s.price),
      }),
    ),
    barbers: barbers.data as CatalogBarber[],
    /** Única regla de "se puede reservar": servicios activos y algún barbero activo con horario (MAINT-001). */
    bookable: services.data.length > 0 && schedules.data.some((s) => activeBarberIds.has(s.barber_id)),
  };
});

type Selection = { service: CatalogService; barbers: CatalogBarber[] };

/**
 * Comprueba que el servicio y el barbero elegidos existen, están activos y son de esta barbería.
 * `barberId` puede ser "pronto" (todos los barberos activos). Devuelve null si algo no cuadra:
 * la página vuelve al paso correspondiente sin error técnico.
 */
export async function resolveSelection(
  barbershop: PublicBarbershop,
  serviceId: string,
  barberId: string,
): Promise<Selection | null> {
  const { services, barbers } = await getBookingCatalog(barbershop);
  const service = services.find((s) => s.id === serviceId);
  if (!service) return null;
  const chosen = barberId === EARLIEST ? barbers : barbers.filter((b) => b.id === barberId);
  return chosen.length > 0 ? { service, barbers: chosen } : null;
}

/** Calcula huecos con los datos actuales de la base (lo usan las páginas y la reserva). */
export async function loadSlots(
  barbershop: PublicBarbershop,
  selection: Selection,
  options: { now?: Date; fromDate?: string; days?: number } = {},
): Promise<AvailableSlot[]> {
  const now = options.now ?? new Date();
  const today = toLocalDate(now, barbershop.timezone);
  const fromDate = options.fromDate ?? today;
  const days = options.days ?? HORIZON_DAYS;
  // Ventana UTC que cubre los días pedidos (con un día de margen por la zona horaria).
  const windowStart = localDateTimeToUtc(`${addDaysToLocalDate(fromDate, -1)}T00:00`, barbershop.timezone);
  const windowEnd = localDateTimeToUtc(`${addDaysToLocalDate(fromDate, days + 1)}T00:00`, barbershop.timezone);
  const barberIds = selection.barbers.map((b) => b.id);
  // Una cita dura como mucho 480 min (check de la base): si se cruza con la ventana, empieza
  // como pronto 480 min antes. Esa cota inferior deja al índice (barbershop_id, starts_at)
  // recorrer solo la ventana y no todo el histórico (revisión fase 4, PERF-003).
  const appointmentsFrom = new Date(windowStart.getTime() - 480 * 60_000);

  const db = createServiceClient();
  const [schedules, blocks, appointments] = await Promise.all([
    db
      .from("barber_schedules")
      .select("barber_id, weekday, start_time, end_time")
      .eq("barbershop_id", barbershop.id)
      .in("barber_id", barberIds),
    db
      .from("barber_blocks")
      .select("barber_id, starts_at, ends_at")
      .eq("barbershop_id", barbershop.id)
      .in("barber_id", barberIds)
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", windowStart.toISOString()),
    db
      .from("appointments")
      .select("barber_id, starts_at, ends_at")
      .eq("barbershop_id", barbershop.id)
      .eq("status", "active")
      .in("barber_id", barberIds)
      .gte("starts_at", appointmentsFrom.toISOString())
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", windowStart.toISOString()),
  ]);
  if (schedules.error) throw schedules.error;
  if (blocks.error) throw blocks.error;
  if (appointments.error) throw appointments.error;

  const toRange = (r: { starts_at: string; ends_at: string }) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) });

  return computeAvailableSlots({
    timezone: barbershop.timezone,
    now,
    durationMinutes: selection.service.durationMinutes,
    barbers: selection.barbers,
    schedules: schedules.data.map((s) => ({
      barberId: s.barber_id,
      weekday: s.weekday,
      startTime: s.start_time,
      endTime: s.end_time,
    })),
    blocks: blocks.data.map((b) => ({ barberId: b.barber_id, range: toRange(b) })),
    appointments: appointments.data.map((a) => ({ barberId: a.barber_id, range: toRange(a) })),
    fromDate,
    days,
  });
}

export type DaySlot = AvailableSlot & { barberName: string };

/**
 * Disponibilidad del paso 3 y 4 en una sola pasada (revisión fase 4, PERF-002): un loadSlots de
 * 30 días (3 consultas) del que salen los días y las horas de cada día. Null si la selección no es
 * válida. `cache` evita repetirlo si se pide dos veces en la misma petición.
 */
export const getAvailability = cache(
  async (barbershop: PublicBarbershop, serviceId: string, barberId: string) => {
    const selection = await resolveSelection(barbershop, serviceId, barberId);
    if (!selection) return null;
    const names = new Map(selection.barbers.map((b) => [b.id, b.name]));
    const slotsByDay = new Map<string, DaySlot[]>();
    for (const slot of await loadSlots(barbershop, selection)) {
      const daySlots = slotsByDay.get(slot.localDate) ?? [];
      daySlots.push({ ...slot, barberName: names.get(slot.barberId) ?? "" });
      slotsByDay.set(slot.localDate, daySlots);
    }
    const days = [...slotsByDay.keys()].map((localDate) => ({ localDate, label: formatLocalDate(localDate) }));
    return { days, slotsByDay };
  },
);
