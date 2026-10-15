// Confirmación de la reserva: enlace a Google Calendar y archivo de calendario (.ics) para el iPhone y
// Outlook (spec 007, historia 4; el botón de compartir por WhatsApp se quitó a petición del usuario).
// Lógica pura, sin "server-only": la usa el navegador para generar la descarga.
// Constitución V y VI: aquí NUNCA entra el token o enlace de cancelación ni los datos del cliente
// (nombre, teléfono, correo); BookingShare solo tiene datos públicos de la cita.

/**
 * Datos públicos de una cita confirmada, para los botones de calendario de la confirmación (Google Calendar
 * y .ics). El nombre "share" viene del diseño inicial con WhatsApp; ya no se comparte nada.
 */
export type BookingShare = {
  serviceName: string;
  barberName: string;
  barbershopName: string;
  /** Dirección pública de la barbería, o null si no la tiene. */
  address: string | null;
  /** Inicio y fin en ISO UTC. */
  startsAt: string;
  endsAt: string;
  /** Día local "2026-10-15" (nombre del archivo). */
  localDate: string;
};

/** "2026-10-15T15:00:00.000Z" → "20261015T150000Z" (fecha y hora UTC de iCalendar). */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Escapa un texto de iCalendar (RFC 5545 §3.3.11): \ ; , y saltos de línea. Cualquier salto (también un
 * \r suelto o los de Unicode) pasa a "\n" escapado y el resto de caracteres de control se elimina: algunos
 * lectores aceptan \r como fin de línea, y un nombre de servicio con "\rURL:…" inyectaría propiedades
 * en el calendario del cliente (revisión spec 007, SEC-001).
 */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|[\r\n\p{Zl}\p{Zp}]/gu, "\\n")
    .replace(/\p{Cc}/gu, "");
}

/** Parte las líneas de más de 75 bytes (RFC 5545 §3.1) sin cortar un carácter UTF-8 por la mitad. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // las continuaciones empiezan con un espacio
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Archivo .ics de la cita. `uid` y `now` llegan por parámetro para que el resultado sea comprobable. */
export function buildIcs(share: BookingShare, { uid, now }: { uid: string; now: Date }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reservas barberias//Reserva//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(share.startsAt)}`,
    `DTEND:${icsDate(share.endsAt)}`,
    `SUMMARY:${icsText(`${share.serviceName} en ${share.barbershopName}`)}`,
    ...(share.address ? [`LOCATION:${icsText(share.address)}`] : []),
    `DESCRIPTION:${icsText(`Barbero: ${share.barberName}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "cita-la-barberia-2026-10-15.ics": sin tildes ni espacios, para que todos los sistemas lo acepten. */
export function icsFileName(share: BookingShare): string {
  const slug = share.barbershopName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cita-${slug || "barberia"}-${share.localDate}.ics`;
}

/**
 * Enlace que abre Google Calendar con el evento ya rellenado ("Nuevo evento" → Guardar): en Android y en
 * el computador el archivo .ics solo se descarga, y lo esperado es que se añada con un toque (decisión
 * del usuario, 2026-10-14). Mismos datos que el .ics, sin token ni datos del cliente.
 */
export function googleCalendarUrl(share: BookingShare): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${share.serviceName} en ${share.barbershopName}`,
    dates: `${icsDate(share.startsAt)}/${icsDate(share.endsAt)}`,
    details: `Barbero: ${share.barberName}`,
  });
  if (share.address) params.set("location", share.address);
  return `https://calendar.google.com/calendar/render?${params}`;
}
