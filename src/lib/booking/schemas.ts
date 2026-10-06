import { z } from "zod";
import { normalizePhone } from "./phone";

// Formulario del paso 4 de la reserva (data-model, BookingInput). Compartido por el
// formulario (cliente) y createBooking (servidor). Mismas reglas que los check de appointments.

export const EARLIEST = "pronto"; // valor de barber_id para "Lo más pronto"

export const bookingSchema = z.object({
  service_id: z.uuid("Elige un servicio."),
  barber_id: z.union([z.uuid(), z.literal(EARLIEST)], "Elige un barbero."),
  starts_at: z.iso.datetime({ offset: true, message: "Elige una hora." }),
  // Sin caracteres de control ni de formato (NUL, saltos de línea, overrides bidi): llegarán a la
  // agenda del panel y al correo de la fase 5 (revisión fase 4, SEC-004).
  customer_name: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre.")
    .max(100, "Máximo 100 caracteres.")
    .regex(/^[^\p{Cc}\p{Cf}]+$/u, "El nombre tiene caracteres no válidos."),
  customer_phone: z
    .string()
    .transform((value, ctx) => {
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Escribe un número de celular de 10 dígitos." });
        return z.NEVER;
      }
      return phone;
    }),
  // Primero se limpia (el autocompletado del móvil suele dejar un espacio) y después se valida.
  customer_email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Escribe un correo válido.").max(254, "Correo demasiado largo.")),
  consent: z.literal("on", "Debes autorizar el tratamiento de tus datos para reservar."),
});

export type BookingInput = z.output<typeof bookingSchema>;
