import "server-only";
import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { cache } from "react";
import type { PublicBarbershop } from "@/lib/barbershops";
import { withService } from "@/lib/db/client";
import { appointments, barberBlocks, barberSchedules, barbers, services } from "@/lib/db/schema";
import { weeklyHours } from "@/lib/storefront/hours";
import { addDaysToLocalDate, formatLocalDate, formatPrice, localDateTimeToUtc, toLocalDate } from "@/lib/time";
import { computeAvailableSlots, HORIZON_DAYS, type AvailableSlot } from "./availability";
import { bookingCalendar } from "./calendar";
import { EARLIEST } from "./schemas";

// Lecturas de la reserva pública con service_role, que se salta RLS (el cliente no tiene sesión).
// Constitución I: TODA consulta filtra por barbershop.id, que viene de getPublicBarbershop(subdomain);
// nunca de un parámetro del cliente. Los ids de servicio y barbero se buscan dentro de esa barbería.

/** Tope defensivo de las listas del catálogo: ya no existe el max_rows de PostgREST (PERF-007). */
const LIST_LIMIT = 200;

export type CatalogService = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  priceLabel: string;
  /** Descripción breve opcional (spec 006); null = sin dato. */
  description: string | null;
};
export type CatalogBarber = { id: string; name: string };

/**
 * Servicios y barberos activos de la barbería (pasos 1 y 2).
 * `cache` evita repetir la consulta en la misma petición: la página y getAvailability la piden
 * con el mismo objeto barbershop (también cacheado por petición).
 */
export const getBookingCatalog = cache(async (barbershop: PublicBarbershop) => {
  // Una sola transacción (una conexión del pool) con las tres lecturas en serie: abrir una por lectura
  // ocupaba 3 conexiones por petición de un pool de 10 (revisión spec 005, PERF-001).
  const { serviceRows, barberRows, scheduleRows } = await withService(async (tx) => {
    const serviceRows = await tx
      .select({
        id: services.id,
        name: services.name,
        durationMinutes: services.durationMinutes,
        price: services.price,
        description: services.description,
      })
      .from(services)
      .where(and(eq(services.barbershopId, barbershop.id), eq(services.isActive, true)))
      .orderBy(asc(services.name))
      .limit(LIST_LIMIT);
    const barberRows = await tx
      .select({ id: barbers.id, name: barbers.name })
      .from(barbers)
      .where(and(eq(barbers.barbershopId, barbershop.id), eq(barbers.isActive, true)))
      .orderBy(asc(barbers.name))
      .limit(LIST_LIMIT);
    // Tramos semanales de los barberos ACTIVOS: dan el horario de la portada y si hay algo que
    // reservar (spec 006, research R3). Sustituye al EXISTS de PERF-006: son pocas filas
    // (barberos × 7 días × tramos) y evitan una consulta aparte para el horario.
    const scheduleRows = await tx
      .select({ weekday: barberSchedules.weekday, startTime: barberSchedules.startTime, endTime: barberSchedules.endTime })
      .from(barberSchedules)
      .innerJoin(barbers, eq(barbers.id, barberSchedules.barberId))
      .where(and(eq(barberSchedules.barbershopId, barbershop.id), eq(barbers.isActive, true)))
      .limit(LIST_LIMIT * 7); // tope solo defensivo: una barbería real tiene decenas de filas (PERF-002)
    return { serviceRows, barberRows, scheduleRows };
  });

  return {
    services: serviceRows.map(
      (s): CatalogService => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: Number(s.price), // numeric llega como texto
        priceLabel: formatPrice(s.price),
        description: s.description,
      }),
    ),
    barbers: barberRows satisfies CatalogBarber[],
    /** Horario de la barbería de lunes a domingo (portada, spec 006). */
    weeklyHours: weeklyHours(scheduleRows),
    /** Única regla de "se puede reservar": servicios activos y algún barbero activo con horario (MAINT-001). */
    bookable: serviceRows.length > 0 && scheduleRows.length > 0,
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

  // Una sola transacción con las tres lecturas en serie (revisión spec 005, PERF-001).
  const { scheduleRows, blockRows, appointmentRows } = await withService(async (tx) => {
    const scheduleRows = await tx
      .select({
        barberId: barberSchedules.barberId,
        weekday: barberSchedules.weekday,
        startTime: barberSchedules.startTime,
        endTime: barberSchedules.endTime,
      })
      .from(barberSchedules)
      .where(and(eq(barberSchedules.barbershopId, barbershop.id), inArray(barberSchedules.barberId, barberIds)));
    const blockRows = await tx
      .select({ barberId: barberBlocks.barberId, startsAt: barberBlocks.startsAt, endsAt: barberBlocks.endsAt })
      .from(barberBlocks)
      .where(
        and(
          eq(barberBlocks.barbershopId, barbershop.id),
          inArray(barberBlocks.barberId, barberIds),
          lt(barberBlocks.startsAt, windowEnd),
          gt(barberBlocks.endsAt, windowStart),
        ),
      );
    const appointmentRows = await tx
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
      );
    return { scheduleRows, blockRows, appointmentRows };
  });

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
 * 30 días (una transacción) del que salen los días y las horas de cada día. Null si la selección no es
 * válida. `cache` evita repetirlo si se pide dos veces en la misma petición.
 */
export const getAvailability = cache(
  async (barbershop: PublicBarbershop, serviceId: string, barberId: string) => {
    const selection = await resolveSelection(barbershop, serviceId, barberId);
    if (!selection) return null;
    const names = new Map(selection.barbers.map((b) => [b.id, b.name]));
    const slotsByDay = new Map<string, DaySlot[]>();
    const now = new Date();
    for (const slot of await loadSlots(barbershop, selection, { now })) {
      const daySlots = slotsByDay.get(slot.localDate) ?? [];
      daySlots.push({ ...slot, barberName: names.get(slot.barberId) ?? "" });
      slotsByDay.set(slot.localDate, daySlots);
    }
    const days = [...slotsByDay.keys()].map((localDate) => ({ localDate, label: formatLocalDate(localDate) }));
    // Carrusel del paso 3: los 30 días del horizonte, con los que no tienen horas en gris.
    const slotCounts = new Map([...slotsByDay].map(([date, slots]) => [date, slots.length]));
    const calendar = bookingCalendar(toLocalDate(now, barbershop.timezone), slotCounts);
    return { days, slotsByDay, calendar };
  },
);
