"use server";

import { headers } from "next/headers";
import type { CancelResult } from "./cancellation-state";
import { submitCancellation } from "./cancel";

/**
 * Server action del botón "Cancelar cita".
 * Uso: `useActionState(cancelAppointment.bind(null, subdomain, token), initialCancelState)`.
 *
 * `subdomain` y `token` viajan desde el navegador y no son de fiar: submitCancellation resuelve la
 * barbería del Host de la petición y rechaza el envío si no coincide (SEC-001).
 */
export async function cancelAppointment(
  subdomain: string,
  token: string,
  _prev: CancelResult | null,
  _formData: FormData,
): Promise<CancelResult> {
  const host = (await headers()).get("host");
  return submitCancellation(host, subdomain, token);
}
