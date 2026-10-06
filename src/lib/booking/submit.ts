import "server-only";
import { getPublicBarbershop } from "@/lib/barbershops";
import { resolveTenant, ROOT_DOMAIN } from "@/lib/tenant";
import { toFieldErrors } from "@/lib/validation";
import { bookAppointment, type BookingOutcome } from "./book";
import { MESSAGES } from "./messages";
import { bookingSchema } from "./schemas";

/**
 * Procesa el envío del paso 4. Separado de la server action para probarlo sin Next.js.
 *
 * La barbería se resuelve del `host` REAL de la petición, en el servidor (constitución I;
 * revisión fase 4, SEC-001). `claimedSubdomain` es lo que dice el formulario: solo se acepta si
 * coincide con el host, para que nadie cree citas en otra barbería cambiando ese argumento.
 */
export async function submitBooking(
  host: string | null,
  claimedSubdomain: string,
  formData: FormData,
  now: Date = new Date(),
): Promise<BookingOutcome> {
  // Honeypot (FR-012): un bot lo rellena; se responde como si todo fuera bien, sin escribir nada.
  if (String(formData.get("website") ?? "").trim() !== "") return { result: { ok: true, summary: null } };

  const tenant = resolveTenant(host, ROOT_DOMAIN);
  if (tenant.kind !== "tenant" || tenant.subdomain !== claimedSubdomain) {
    return { result: { ok: false, code: "unavailable", message: MESSAGES.shopUnavailable } };
  }
  const barbershop = await getPublicBarbershop(tenant.subdomain);
  if (!barbershop) return { result: { ok: false, code: "unavailable", message: MESSAGES.shopUnavailable } };

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      result: { ok: false, code: "invalid", message: MESSAGES.invalid, fieldErrors: toFieldErrors(parsed.error) },
    };
  }

  try {
    return await bookAppointment(barbershop, parsed.data, now);
  } catch (error) {
    // Solo código y mensaje: nunca el error completo, cuyo `details` puede llevar nombre, teléfono
    // o correo del cliente ("Failing row contains …") (constitución VI; revisión fase 4, SEC-002).
    const { code, message } = (error ?? {}) as { code?: string; message?: string };
    console.error("Error al reservar", { code, message });
    return { result: { ok: false, code: "server_error", message: MESSAGES.serverError } };
  }
}
