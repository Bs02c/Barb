import { formatTimeOfDay, isoWeekday, toLocalDate, toLocalTimeOfDay, WEEKDAYS } from "@/lib/time";

// Horario y estado de apertura de la portada (spec 006, FR-003, FR-004 y research R3–R5).
// Lógica pura, sin base de datos: el horario de la barbería se deriva de los tramos semanales de sus
// barberos ACTIVOS (los filtra la consulta). Las horas de los tramos ya son hora local de la barbería
// ("09:00:00"); la hora de "ahora" se convierte solo con src/lib/time.ts (constitución IV).

export type DayHours = {
  /** 1 = lunes … 7 = domingo (ISO), como barber_schedules.weekday. */
  weekday: number;
  label: string;
  /** "HH:MM" en hora local, o null si ese día no abre. */
  open: string | null;
  close: string | null;
  openLabel: string | null;
  closeLabel: string | null;
};

/** `kind` decide el color en la portada (open en verde); `text` es lo que se muestra. */
export type OpeningStatus = { kind: "open" | "opensToday" | "closed"; text: string };

type ScheduleSlot = { weekday: number; startTime: string; endTime: string };

/** "09:00:00" o "09:00" → "09:00" (las cadenas HH:MM se comparan bien como texto). */
const hhmm = (time: string) => time.slice(0, 5);

/**
 * Los siete días de lunes a domingo. Apertura = inicio más temprano y cierre = fin más tardío de
 * todos los tramos del día; los huecos entre tramos no se muestran (spec 006, casos límite).
 */
export function weeklyHours(slots: ScheduleSlot[]): DayHours[] {
  return WEEKDAYS.map(({ value, label }) => {
    let open: string | null = null;
    let close: string | null = null;
    for (const slot of slots) {
      if (slot.weekday !== value) continue;
      const start = hhmm(slot.startTime);
      const end = hhmm(slot.endTime);
      if (open === null || start < open) open = start;
      if (close === null || end > close) close = end;
    }
    return {
      weekday: value,
      label,
      open,
      close,
      openLabel: open && formatTimeOfDay(open),
      closeLabel: close && formatTimeOfDay(close),
    };
  });
}

/** Día ISO de hoy en la zona de la barbería (para resaltarlo en el horario). */
export function todayWeekday(now: Date, timezone: string): number {
  return isoWeekday(toLocalDate(now, timezone));
}

/**
 * Estado de apertura con la hora actual en la zona de la barbería (spec 006, historia 1, escenarios
 * 5–7). Abierta en [apertura, cierre): a la hora exacta de cierre ya está cerrada.
 */
export function openingStatus(hours: DayHours[], now: Date, timezone: string): OpeningStatus {
  const time = toLocalTimeOfDay(now, timezone);
  const today = todayWeekday(now, timezone);
  const byWeekday = (weekday: number) => hours.find((d) => d.weekday === weekday);

  const day = byWeekday(today);
  if (day?.open && day.close) {
    if (time >= day.open && time < day.close) return { kind: "open", text: `Abierto ahora · hasta ${day.closeLabel}` };
    if (time < day.open) return { kind: "opensToday", text: `Abre hoy a las ${day.openLabel}` };
  }

  // Próximo día con horario en la semana siguiente (hoy ya no cuenta: o no abre o ya cerró).
  for (let offset = 1; offset <= 7; offset++) {
    const next = byWeekday(((today - 1 + offset) % 7) + 1);
    if (next?.open) {
      const when = offset === 1 ? "mañana" : next.label.toLowerCase();
      return { kind: "closed", text: `Cerrado ahora · Abre ${when} a las ${next.openLabel}` };
    }
  }
  return { kind: "closed", text: "Cerrado ahora" };
}

/** Búsqueda de la dirección en Google Maps (research R5): sin clave de API ni URL guardada. */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
