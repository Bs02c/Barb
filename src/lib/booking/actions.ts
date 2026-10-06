"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { sendConfirmation } from "@/lib/email/confirmation";
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
  const { result, confirmation } = await submitBooking(host, subdomain, formData);
  // El correo sale después de responder: no retrasa la confirmación y un fallo no deshace la cita.
  // El navegador recibe solo `result`; el token de cancelación no sale del servidor.
  if (confirmation) after(() => sendConfirmation(confirmation));
  return result;
}
