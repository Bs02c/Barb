// Textos de la reserva que se muestran en más de un sitio (contracts/booking.md, "Mensajes").
// Un solo lugar para que el servidor y las páginas digan lo mismo (revisión fase 4, MAINT-009).

export const MESSAGES = {
  slotTaken: "Ese horario ya no está disponible. Elige otra hora.",
  unavailable: "Ese servicio o barbero ya no está disponible.",
  shopUnavailable: "Esta barbería no está disponible.",
  noSchedule: "Esta barbería aún no tiene horarios disponibles.",
  noFreeSlots: "No quedan horas libres en los próximos 30 días.",
  barberNoFreeSlots: "Este barbero no tiene horas libres en los próximos 30 días.",
  // Neutro a propósito: no revela a un tercero si un número tiene citas (revisión fase 4, SEC-003).
  limitReached:
    "No pudimos completar la reserva con este número. Si ya tienes citas pendientes, contacta con la barbería.",
  invalid: "Revisa los campos marcados.",
  serverError: "No se pudo completar la reserva. Inténtalo de nuevo.",
} as const;
