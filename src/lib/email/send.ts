import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Envío de correo (spec 003, research §5; ADR-015). Sin SDK: un solo POST a la API de Resend.
// EMAIL_TRANSPORT=outbox escribe el correo en .outbox/ (desarrollo y tests); resend lo envía.

export type Email = { to: string; subject: string; html: string; text: string };

const DEFAULT_OUTBOX = path.join(process.cwd(), ".outbox");

function transport(): "outbox" | "resend" {
  const configured = process.env.EMAIL_TRANSPORT;
  if (configured === "outbox" || configured === "resend") return configured;
  return process.env.NODE_ENV === "production" ? "resend" : "outbox";
}

export async function sendEmail(email: Email, outboxDir: string = DEFAULT_OUTBOX): Promise<void> {
  if (transport() === "outbox") {
    // Nunca en producción: escribiría correos de clientes en disco.
    if (process.env.NODE_ENV === "production") throw new Error("El transporte outbox no se permite en producción");
    await mkdir(outboxDir, { recursive: true });
    const file = path.join(outboxDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify(email, null, 2), "utf8");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Falta RESEND_API_KEY o EMAIL_FROM para enviar correo");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) {
    // Solo el código HTTP y el nombre del error: el cuerpo puede repetir destinatario o contenido.
    const body = (await response.json().catch(() => ({}))) as { name?: string };
    throw Object.assign(new Error(`Resend respondió ${response.status}`), { code: body.name ?? String(response.status) });
  }
}
