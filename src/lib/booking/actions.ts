"use server";

import { headers } from "next/headers";
import type { BookingResult } from "./booking-state";
import { submitBooking } from "./submit";

/**
 * Server action del paso 4 de la reserva.
 * Uso: `useActionState(createBooking.bind(null, subdomain), initialBookingState)`.
 * Campos del formData: service_id, barber_id (uuid o "pronto"), starts_at (ISO UTC),
 * customer_name, customer_phone, customer_email, consent ("on") y website (honeypot, vacío).
 *
 * `subdomain` viaja desde el navegador y no es de fiar: submitBooking resuelve la barbería del
 * Host de la petición y rechaza el envío si no coincide (revisión fase 4, SEC-001).
 */
export async function createBooking(
  subdomain: string,
  _prev: BookingResult | null,
  formData: FormData,
): Promise<BookingResult> {
  const host = (await headers()).get("host");
  return submitBooking(host, subdomain, formData);
}
