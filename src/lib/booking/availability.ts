// Cálculo de huecos disponibles para la reserva pública (spec 002, FR-005 a FR-007).
// Función pura: no lee la base de datos ni el reloj; todo llega por parámetros.
// La usan las páginas para mostrar horas y el servidor para volver a validar al confirmar,
// así la regla vive en un solo sitio (research §1).

import {
  addDaysToLocalDate,
  createZoneConverter,
  formatTimeOfDay,
  isoWeekday,
  localDateTimeToUtc,
  toLocalDate,
} from "@/lib/time";

export const STEP_MINUTES = 15; // las horas de inicio se prueban cada 15 min (FR-006)
export const MIN_LEAD_MINUTES = 60; // al menos 1 h de antelación (FR-007)
export const HORIZON_DAYS = 30; // hasta 30 días hacia adelante (FR-007)

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Intervalo semiabierto [start, end), igual que la restricción de exclusión de la base de datos. */
export type TimeRange = { start: Date; end: Date };

export type AvailabilityInput = {
  timezone: string;
  now: Date;
  durationMinutes: number;
  /** Barberos candidatos: uno, o todos los activos con "Lo más pronto". */
  barbers: { id: string; name: string }[];
  /** Horario semanal en hora local de la barbería; weekday ISO (1 = lunes). */
  schedules: { barberId: string; weekday: number; startTime: string; endTime: string }[];
  blocks: { barberId: string; range: TimeRange }[];
  /** Solo citas activas. */
  appointments: { barberId: string; range: TimeRange }[];
  /** Primer día local a calcular (por defecto, hoy en la barbería). */
  fromDate?: string;
  /** Cuántos días calcular (por defecto, todo el horizonte). */
  days?: number;
};

export type AvailableSlot = {
  /** Inicio en ISO UTC: lo que viaja en la URL y en el formulario. */
  startsAt: string;
  /** Día local "YYYY-MM-DD" de la barbería. */
  localDate: string;
  /** "9:15 a. m." en hora local. */
  label: string;
  /** Barbero que atendería (con "Lo más pronto", el que asigna la regla de reparto). */
  barberId: string;
};

/**
 * Horas de inicio libres, ordenadas. Un inicio es válido si la cita completa
 * [inicio, inicio + duración) cabe en un tramo del barbero, empieza al menos 1 h después
 * de `now`, cae antes del fin del horizonte y no se cruza con bloqueos ni citas activas.
 * Si varios barberos están libres a la misma hora, se elige el que tiene menos citas ese día
 * y, a igualdad, por nombre (research §3).
 */
export function computeAvailableSlots(input: AvailabilityInput): AvailableSlot[] {
  const { timezone, now, durationMinutes, barbers } = input;
  const today = toLocalDate(now, timezone);
  const horizonEnd = localDateTimeToUtc(`${addDaysToLocalDate(today, HORIZON_DAYS)}T00:00`, timezone);
  const earliestStartMs = now.getTime() + MIN_LEAD_MINUTES * MINUTE;
  const horizonEndMs = horizonEnd.getTime();
  const fromDate = input.fromDate && input.fromDate > today ? input.fromDate : today;
  const days = input.days ?? HORIZON_DAYS;
  const duration = durationMinutes * MINUTE;
  // Conversor rápido para toda la ventana calculada (exacto aunque cruce un cambio de horario).
  const zone = createZoneConverter(
    timezone,
    new Date(Math.min(now.getTime(), localDateTimeToUtc(`${fromDate}T00:00`, timezone).getTime()) - 2 * DAY),
    new Date(horizonEnd.getTime() + 2 * DAY),
  );

  // Citas por barbero y día local, para la regla de reparto de "Lo más pronto".
  const appointmentsPerDay = new Map<string, number>();
  for (const { barberId, range } of input.appointments) {
    const key = `${barberId}|${zone.toLocalDate(range.start)}`;
    appointmentsPerDay.set(key, (appointmentsPerDay.get(key) ?? 0) + 1);
  }

  // Los barberos suelen compartir horas de tramo ("09:00"): cada hora local de cada día se
  // convierte a UTC una sola vez (la conversión es lo más caro del cálculo).
  const utcCache = new Map<string, number>();
  const toUtc = (localDate: string, time: string) => {
    const key = `${localDate}T${time.slice(0, 5)}`;
    let value = utcCache.get(key);
    if (value === undefined) {
      value = zone.localToUtcMs(key);
      utcCache.set(key, value);
    }
    return value;
  };

  // Orden alfabético de los barberos para desempatar, calculado una vez (localeCompare con
  // idioma crea un comparador en cada llamada y era lo más lento del cálculo).
  const collator = new Intl.Collator("es");
  const nameRank = new Map(
    [...barbers].sort((a, b) => collator.compare(a.name, b.name)).map((b, index) => [b.id, index]),
  );

  // Rangos ocupados (bloqueos y citas) por barbero, en ms, agrupados una sola vez (PERF-004).
  const busyByBarber = new Map<string, [number, number][]>(barbers.map((b) => [b.id, []]));
  for (const { barberId, range } of [...input.blocks, ...input.appointments]) {
    busyByBarber.get(barberId)?.push([range.start.getTime(), range.end.getTime()]);
  }

  // Hora de inicio (ms UTC) → mejor barbero libre a esa hora. La etiqueta se formatea al final,
  // solo para los huecos que se devuelven (PERF-001).
  const best = new Map<number, { localDate: string; localMinutes: number; barberId: string; load: number; rank: number }>();

  for (let i = 0; i < days; i++) {
    const localDate = addDaysToLocalDate(fromDate, i);
    const weekday = isoWeekday(localDate);
    const dayStart = zone.localToUtcMs(`${localDate}T00:00`);
    const dayEnd = zone.localToUtcMs(`${addDaysToLocalDate(localDate, 1)}T00:00`);

    for (const barber of barbers) {
      // Solo los rangos que tocan este día: cada candidato se compara con 0–3 rangos, no con el mes.
      const busy = (busyByBarber.get(barber.id) ?? []).filter(([start, end]) => start < dayEnd && end > dayStart);
      const load = appointmentsPerDay.get(`${barber.id}|${localDate}`) ?? 0;
      const rank = nameRank.get(barber.id) ?? 0;

      for (const tramo of input.schedules) {
        if (tramo.barberId !== barber.id || tramo.weekday !== weekday) continue;
        const tramoStart = toUtc(localDate, tramo.startTime);
        const tramoEnd = toUtc(localDate, tramo.endTime);
        const [startHour, startMinute] = tramo.startTime.split(":").map(Number);
        const tramoStartMinutes = startHour * 60 + startMinute; // hora local del inicio del tramo

        for (let t = tramoStart; t + duration <= tramoEnd; t += STEP_MINUTES * MINUTE) {
          if (t < earliestStartMs || t >= horizonEndMs) continue;
          const end = t + duration;
          if (busy.some(([busyStart, busyEnd]) => t < busyEnd && busyStart < end)) continue; // [inicio, fin)

          const current = best.get(t);
          const better = !current || load < current.load || (load === current.load && rank < current.rank);
          if (better) {
            const localMinutes = tramoStartMinutes + (t - tramoStart) / MINUTE;
            best.set(t, { localDate, localMinutes, barberId: barber.id, load, rank });
          }
        }
      }
    }
  }

  // Etiqueta desde la hora local del tramo: hay pocas horas distintas ("9:15 a. m."), así que se
  // formatean una vez cada una. Asume que no hay cambio de horario dentro de un tramo de atención.
  const labels = new Map<number, string>();
  const labelFor = (minutes: number) => {
    let label = labels.get(minutes);
    if (!label) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      label = formatTimeOfDay(`${hh}:${String(minutes % 60).padStart(2, "0")}`);
      labels.set(minutes, label);
    }
    return label;
  };

  return [...best.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, entry]) => ({
      startsAt: new Date(t).toISOString(),
      localDate: entry.localDate,
      label: labelFor(entry.localMinutes),
      barberId: entry.barberId,
    }));
}
