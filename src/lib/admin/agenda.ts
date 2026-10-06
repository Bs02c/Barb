import { addDaysToLocalDate, localDateTimeToUtc } from "@/lib/time";

// Rango UTC de un día local de la barbería, [start, end): un día local no coincide con un día UTC
// (en Bogotá las 23:30 del 13 son las 04:30 UTC del 14). Constitución IV: conversión solo con time.ts.

export function dayRangeUtc(localDate: string, timeZone: string): { start: string; end: string } {
  return {
    start: localDateTimeToUtc(`${localDate}T00:00`, timeZone).toISOString(),
    end: localDateTimeToUtc(`${addDaysToLocalDate(localDate, 1)}T00:00`, timeZone).toISOString(),
  };
}
