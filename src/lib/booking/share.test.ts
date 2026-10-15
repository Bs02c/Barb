import { describe, expect, it } from "vitest";
import { buildIcs, icsFileName, shareText, whatsappShareUrl, type BookingShare } from "./share";

// Archivo de calendario y texto para WhatsApp de la confirmación (spec 007, historia 4, FR-007 a FR-009).
const share: BookingShare = {
  serviceName: "Corte clásico",
  barberName: "Andrés",
  barbershopName: "La Barbería",
  address: "Calle 45 # 12-30, Bogotá",
  startsAt: "2026-10-15T15:00:00.000Z",
  endsAt: "2026-10-15T15:30:00.000Z",
  localDate: "2026-10-15",
  dateLabel: "jue, 15 de oct",
  timeLabel: "10:00 a. m.",
};
const options = { uid: "cita-123@reservas", now: new Date("2026-10-14T20:00:00Z") };

describe("buildIcs", () => {
  const ics = buildIcs(share, options);

  it("es un VEVENT con inicio y fin en UTC", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("\r\nDTSTART:20261015T150000Z\r\n");
    expect(ics).toContain("\r\nDTEND:20261015T153000Z\r\n");
    expect(ics).toContain("\r\nDTSTAMP:20261014T200000Z\r\n");
    expect(ics).toContain("\r\nUID:cita-123@reservas\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("título, dirección escapada y barbero", () => {
    expect(ics).toContain("\r\nSUMMARY:Corte clásico en La Barbería\r\n");
    expect(ics).toContain("\r\nLOCATION:Calle 45 # 12-30\\, Bogotá\r\n");
    expect(ics).toContain("\r\nDESCRIPTION:Barbero: Andrés\r\n");
  });

  it("sin dirección no hay LOCATION", () => {
    expect(buildIcs({ ...share, address: null }, options)).not.toContain("LOCATION");
  });

  it("escapa ; \\ y saltos de línea, y parte las líneas largas en 75 bytes como máximo", () => {
    const long = buildIcs({ ...share, serviceName: "Corte; barba\\ y\ncejas ".repeat(6) }, options);
    expect(long).toContain("Corte\\; barba\\\\ y\\ncejas");
    const encoder = new TextEncoder();
    expect(long.split("\r\n").every((line) => encoder.encode(line).length <= 75)).toBe(true);
  });

  it("un \\r suelto o un control en un nombre no inyecta propiedades (SEC-001)", () => {
    const evil = buildIcs({ ...share, serviceName: "Corte\rURL:https://evil.example\u0007" }, options);
    const lines = evil.split("\r\n");
    expect(lines.some((line) => line.startsWith("URL:"))).toBe(false);
    expect(lines).toContain("SUMMARY:Corte\\nURL:https://evil.example en La Barbería");
    expect(evil.replace(/\r\n/g, "")).not.toMatch(/[\r\n\u0007]/);
  });

  it("solo usa saltos CRLF", () => {
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});

describe("compartir", () => {
  it("texto con servicio, barbería, fecha y hora", () => {
    expect(shareText(share)).toBe("Reservé Corte clásico en La Barbería el jue, 15 de oct a las 10:00 a. m.");
  });

  it("termina en un solo punto también con horas de 24 h", () => {
    expect(shareText({ ...share, timeLabel: "10:00" })).toBe("Reservé Corte clásico en La Barbería el jue, 15 de oct a las 10:00.");
  });

  it("enlace de WhatsApp con el texto codificado", () => {
    const url = new URL(whatsappShareUrl(share));
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(shareText(share));
  });

  it("nombre del archivo sin tildes ni espacios", () => {
    expect(icsFileName(share)).toBe("cita-la-barberia-2026-10-15.ics");
  });
});
