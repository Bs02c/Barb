import "server-only";
import type { BookingSummary } from "@/lib/booking/booking-state";
import { escapeHtml } from "./escape";
import { sendEmail, type Email } from "./send";

// Correo de confirmación de la cita (spec 003, FR-001). HTML con estilos en línea: los clientes
// de correo ignoran las hojas de estilo. Todo valor dinámico pasa por escapeHtml.

export type ConfirmationData = {
  to: string;
  barbershopName: string;
  summary: BookingSummary;
  cancelUrl: string;
};

export function confirmationEmail(data: ConfirmationData): Omit<Email, "to"> {
  const { barbershopName, summary, cancelUrl } = data;
  const subject = `Cita confirmada en ${barbershopName}`;

  const rows: [string, string][] = [
    ["Servicio", summary.serviceName],
    ["Barbero", summary.barberName],
    ["Fecha y hora", summary.startsAtLabel],
    ["Duración", `${summary.durationMinutes} min`],
    ["Precio", summary.priceLabel],
  ];

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f1ec;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<h1 style="font-size:22px;margin:0 0 8px">Cita confirmada</h1>
<p style="margin:0 0 16px">Tu cita en <strong>${escapeHtml(barbershopName)}</strong> quedó reservada.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:6px 0;color:#57534e">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:0 0 12px">¿No puedes asistir? Cancela para liberar el horario:</p>
<a href="${escapeHtml(cancelUrl)}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Cancelar cita</a>
</div>
</body></html>`;

  const text = [
    `Cita confirmada en ${barbershopName}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Si no puedes asistir, cancela aquí para liberar el horario:",
    cancelUrl,
  ].join("\n");

  return { subject, html, text };
}

/** Envía la confirmación. Nunca lanza: un fallo no debe deshacer la cita (spec 003, FR-002). */
export async function sendConfirmation(data: ConfirmationData): Promise<void> {
  try {
    await sendEmail({ to: data.to, ...confirmationEmail(data) });
  } catch (error) {
    // Solo código y mensaje: ni destinatario ni enlace (constitución VI).
    const { code, message } = (error ?? {}) as { code?: string; message?: string };
    console.error("Error al enviar la confirmación", { code, message });
  }
}
