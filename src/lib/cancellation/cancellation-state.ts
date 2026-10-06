// Tipos de la cancelación (contracts/cancellation.md). Archivo aparte porque un módulo
// "use server" solo puede exportar funciones async.

export type CancellationDetails = {
  serviceName: string;
  barberName: string;
  startsAtLabel: string; // formatDateTime en la zona de la barbería
  durationMinutes: number;
  priceLabel: string; // "$ 25.000"
};

/** Lo que muestra la página del enlace. Nunca incluye teléfono ni correo del cliente. */
export type CancellationView =
  | { status: "active"; details: CancellationDetails }
  | { status: "already_cancelled"; details: CancellationDetails }
  | { status: "past"; details: CancellationDetails }
  | { status: "invalid" };

export type CancelResult =
  | { ok: true }
  | { ok: false; code: "already_cancelled" | "past" | "invalid" | "server_error"; message: string };

/** Estado inicial para useActionState (aún no se ha pulsado nada). */
export const initialCancelState: CancelResult | null = null;
