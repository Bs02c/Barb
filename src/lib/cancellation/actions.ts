"use server";

import type { CancelResult } from "./cancellation-state";

/**
 * Server action del botón "Cancelar cita".
 * Uso: `useActionState(cancelAppointment.bind(null, subdomain, token), initialCancelState)`.
 * `subdomain` viaja desde el navegador y no es de fiar: se resuelve la barbería del Host.
 */
export async function cancelAppointment(
  _subdomain: string,
  _token: string,
  _prev: CancelResult | null,
  _formData: FormData,
): Promise<CancelResult> {
  throw new Error("pendiente: T009"); // cuerpo provisional; el contrato es la firma
}
