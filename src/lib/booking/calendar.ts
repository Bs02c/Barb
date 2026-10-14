import { addDaysToLocalDate, localDateParts, toLocalTimeOfDay } from "@/lib/time";
import { HORIZON_DAYS, type AvailableSlot } from "./availability";

// Paso 3 de la reserva: carrusel de fechas y franjas Mañana / Tarde / Noche (pedido del usuario,
// 2026-10-14; DESIGN.md "Paso 3"). Lógica pura: los huecos ya los calculó computeAvailableSlots.

export type CalendarDay = {
  localDate: string;
  weekday: string; // "jue"
  day: string; // "15"
  month: string; // "oct"
  isToday: boolean;
  /** Tiene al menos una hora libre: si no, la tarjeta sale en gris y no se puede elegir. */
  available: boolean;
};

/**
 * Los días del horizonte de reserva (hoy y los 29 siguientes), con su disponibilidad. Muestra también
 * los días sin horas, en gris, para que el cliente vea el calendario completo.
 */
export function bookingCalendar(today: string, availableDates: ReadonlySet<string>): CalendarDay[] {
  return Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const localDate = addDaysToLocalDate(today, i);
    return { localDate, ...localDateParts(localDate), isToday: i === 0, available: availableDates.has(localDate) };
  });
}

export type PeriodId = "manana" | "tarde" | "noche";

/** Franjas del día en hora local [desde, hasta): Mañana < 12:00 ≤ Tarde < 18:00 ≤ Noche (decisión del usuario). */
export const PERIODS: readonly { id: PeriodId; label: string; from: string; to: string }[] = [
  { id: "manana", label: "Mañana", from: "00:00", to: "12:00" },
  { id: "tarde", label: "Tarde", from: "12:00", to: "18:00" },
  { id: "noche", label: "Noche", from: "18:00", to: "24:00" },
];

export type PeriodSlots<S> = { id: PeriodId; label: string; slots: S[] };

/** Reparte las horas de un día en las tres franjas (siempre las tres, aunque alguna quede vacía). */
export function groupByPeriod<S extends Pick<AvailableSlot, "startsAt">>(slots: S[], timezone: string): PeriodSlots<S>[] {
  const groups = PERIODS.map(({ id, label }) => ({ id, label, slots: [] as S[] }));
  for (const slot of slots) {
    const time = toLocalTimeOfDay(slot.startsAt, timezone);
    const index = PERIODS.findIndex((p) => time >= p.from && time < p.to);
    groups[index].slots.push(slot);
  }
  return groups;
}

/** Franja abierta: la pedida en la URL si tiene horas; si no, la primera con horas (decisión del usuario). */
export function pickPeriod<S>(periods: PeriodSlots<S>[], requested: string | undefined): PeriodSlots<S> | undefined {
  return periods.find((p) => p.id === requested && p.slots.length > 0) ?? periods.find((p) => p.slots.length > 0);
}
