// Único módulo de conversión de zona horaria (constitución, principio IV).
// La base de datos guarda UTC; aquí se convierte a/desde la hora local de la barbería.
// Sin dependencias: usa Intl, que trae la base de datos de zonas IANA.

const LOCALE = "es-CO";

/** Días ISO (1 = lunes … 7 = domingo), igual que barber_schedules.weekday. */
export const WEEKDAYS = [
  { value: 1, label: "Lunes", short: "lun" },
  { value: 2, label: "Martes", short: "mar" },
  { value: 3, label: "Miércoles", short: "mié" },
  { value: 4, label: "Jueves", short: "jue" },
  { value: 5, label: "Viernes", short: "vie" },
  { value: 6, label: "Sábado", short: "sáb" },
  { value: 7, label: "Domingo", short: "dom" },
] as const;

// Minutos que la zona está por delante de UTC en ese instante (Bogotá: -300).
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Convierte una fecha y hora local de la barbería ("2026-10-13T10:00", como la da un
 * <input type="datetime-local">) al instante UTC correspondiente.
 */
export function localDateTimeToUtc(local: string, timeZone: string): Date {
  const match = LOCAL_DATETIME.exec(local);
  if (!match) throw new Error(`Fecha y hora local inválida: ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Dos pasadas para acertar el desfase cerca de un cambio de horario.
  let utc = wallAsUtc - offsetMinutes(new Date(wallAsUtc), timeZone) * 60_000;
  utc = wallAsUtc - offsetMinutes(new Date(utc), timeZone) * 60_000;
  return new Date(utc);
}

/** Instante UTC → "2026-10-13T10:00" en la hora local de la barbería (para rellenar formularios). */
export function utcToLocalDateTime(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const local = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60_000);
  return local.toISOString().slice(0, 16);
}

/** "lun 13 oct, 10:00 a. m." en la hora local de la barbería. */
export function formatDateTime(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Hora de un tramo del horario semanal ("09:00:00" de Postgres) → "9:00 a. m.". */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

/** Precio en pesos colombianos: 25000 → "$ 25.000". */
export function formatPrice(price: number | string): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(price),
  );
}
