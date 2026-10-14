import "server-only";
import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { cache } from "react";
import type { PublicBarbershop } from "@/lib/barbershops";
import { withService } from "@/lib/db/client";
import { appointments, barberBlocks, barberSchedules, barbers, services } from "@/lib/db/schema";
import { addDaysToLocalDate, formatLocalDate, formatPrice, localDateTimeToUtc, toLocalDate } from "@/lib/time";
import { computeAvailableSlots, HORIZON_DAYS, type AvailableSlot } from "./availability";
import { EARLIEST } from "./schemas";

// Lecturas de la reserva pública con service_role, que se salta RLS (el cliente no tiene sesión).
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
  // Tres lecturas en paralelo, cada una en su transacción corta (misma latencia que antes; research §9).
  const [serviceRows, barberRows, scheduleRows] = await Promise.all([
    withService((tx) =>
      tx
        .select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes, price: services.price })
        .from(services)
        .where(and(eq(services.barbershopId, barbershop.id), eq(services.isActive, true)))
        .orderBy(asc(services.name)),
    ),
    withService((tx) =>
      tx
        .select({ id: barbers.id, name: barbers.name })
        .from(barbers)
        .where(and(eq(barbers.barbershopId, barbershop.id), eq(barbers.isActive, true)))
        .orderBy(asc(barbers.name)),
    ),
    withService((tx) =>
      tx
        .select({ barberId: barberSchedules.barberId })
        .from(barberSchedules)
        .where(eq(barberSchedules.barbershopId, barbershop.id)),
    ),
  ]);

  const activeBarberIds = new Set(barberRows.map((b) => b.id));

  return {
    services: serviceRows.map(
      (s): CatalogService => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: Number(s.price), // numeric llega como texto
        priceLabel: formatPrice(s.price),
      }),
    ),
    barbers: barberRows satisfies CatalogBarber[],
    /** Única regla de "se puede reservar": servicios activos y algún barbero activo con horario (MAINT-001). */
    bookable: serviceRows.length > 0 && scheduleRows.some((s) => activeBarberIds.has(s.barberId)),
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

  const [scheduleRows, blockRows, appointmentRows] = await Promise.all([
    withService((tx) =>
      tx
        .select({
          barberId: barberSchedules.barberId,
          weekday: barberSchedules.weekday,
          startTime: barberSchedules.startTime,
          endTime: barberSchedules.endTime,
        })
        .from(barberSchedules)
        .where(and(eq(barberSchedules.barbershopId, barbershop.id), inArray(barberSchedules.barberId, barberIds))),
    ),
    withService((tx) =>
      tx
        .select({ barberId: barberBlocks.barberId, startsAt: barberBlocks.startsAt, endsAt: barberBlocks.endsAt })
        .from(barberBlocks)
        .where(
          and(
            eq(barberBlocks.barbershopId, barbershop.id),
            inArray(barberBlocks.barberId, barberIds),
            lt(barberBlocks.startsAt, windowEnd),
            gt(barberBlocks.endsAt, windowStart),
          ),
        ),
    ),
    withService((tx) =>
      tx
        .select({ barberId: appointments.barberId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.barbershopId, barbershop.id),
            eq(appointments.status, "active"),
            inArray(appointments.barberId, barberIds),
            gte(appointments.startsAt, appointmentsFrom),
            lt(appointments.startsAt, windowEnd),
            gt(appointments.endsAt, windowStart),
          ),
        ),
    ),
  ]);

  const toRange = (r: { startsAt: Date; endsAt: Date }) => ({ start: r.startsAt, end: r.endsAt });

  return computeAvailableSlots({
    timezone: barbershop.timezone,
    now,
    durationMinutes: selection.service.durationMinutes,
    barbers: selection.barbers,
    schedules: scheduleRows,
    blocks: blockRows.map((b) => ({ barberId: b.barberId, range: toRange(b) })),
    appointments: appointmentRows.map((a) => ({ barberId: a.barberId, range: toRange(a) })),
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
