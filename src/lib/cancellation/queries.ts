import "server-only";
import type { PublicBarbershop } from "@/lib/barbershops";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateTime, formatPrice } from "@/lib/time";
import type { CancellationDetails, CancellationView } from "./cancellation-state";
import { cancelTokenSchema } from "./schemas";
import { hashToken } from "./token";

// Lectura de la cita de un enlace de cancelación (spec 003, research §7). Solo lee: abrir el
// enlace nunca cancela. Filtra siempre por la barbería y por el hash del token (constitución I).

/** Cita de la barbería con ese token, o null. Nombres de servicio y barbero aunque estén inactivos. */
async function findByToken(barbershop: PublicBarbershop, token: string) {
  const { data, error } = await createServiceClient()
    .from("appointments")
    .select("starts_at, status, service_duration_minutes, service_price, services(name), barbers(name)")
    .eq("barbershop_id", barbershop.id)
    .eq("cancel_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type FoundAppointment = NonNullable<Awaited<ReturnType<typeof findByToken>>>;

export function toDetails(appointment: FoundAppointment, barbershop: PublicBarbershop): CancellationDetails {
  return {
    serviceName: appointment.services?.name ?? "",
    barberName: appointment.barbers?.name ?? "",
    startsAtLabel: formatDateTime(appointment.starts_at, barbershop.timezone),
    durationMinutes: appointment.service_duration_minutes,
    priceLabel: formatPrice(appointment.service_price),
  };
}

/** Lectura para la página. Token con formato inválido → { status: "invalid" } sin consultar. */
export async function getCancellation(
  barbershop: PublicBarbershop,
  token: string,
  now: Date = new Date(),
): Promise<CancellationView> {
  if (!cancelTokenSchema.safeParse(token).success) return { status: "invalid" };
  const appointment = await findByToken(barbershop, token);
  if (!appointment) return { status: "invalid" };

  const details = toDetails(appointment, barbershop);
  if (appointment.status === "cancelled") return { status: "already_cancelled", details };
  if (new Date(appointment.starts_at) <= now) return { status: "past", details };
  return { status: "active", details };
}

export { findByToken };
