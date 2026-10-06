// Resultado de createBooking (src/lib/booking/actions.ts). Archivo aparte porque un módulo
// "use server" solo puede exportar funciones async.

export type BookingSummary = {
  serviceName: string;
  barberName: string;
  startsAtLabel: string; // "mar, 13 oct, 10:00 a. m." en hora local de la barbería
  durationMinutes: number;
  priceLabel: string; // "$ 25.000"
};

/** invalid: datos del formulario; server_error: fallo inesperado del servidor (revisión fase 4, MAINT-002). */
export type BookingErrorCode = "slot_taken" | "limit_reached" | "unavailable" | "invalid" | "server_error";

export type BookingResult =
  | {
      ok: true;
      /** null cuando el envío se descartó en silencio (honeypot): mostrar una confirmación genérica. */
      summary: BookingSummary | null;
    }
  | {
      ok: false;
      code: BookingErrorCode;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

/** Estado inicial para useActionState (aún no se ha enviado nada). */
export const initialBookingState: BookingResult | null = null;
