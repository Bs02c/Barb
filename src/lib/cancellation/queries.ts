import "server-only";
import { and, eq } from "drizzle-orm";
import type { PublicBarbershop } from "@/lib/barbershops";
import { withService } from "@/lib/db/client";
import { appointments, barbers, services } from "@/lib/db/schema";
import { formatDateTime, formatPrice } from "@/lib/time";
import type { CancellationDetails, CancellationView } from "./cancellation-state";
import { cancelTokenSchema } from "./schemas";
import { hashToken } from "./token";

// Lectura de la cita de un enlace de cancelación (spec 003, research §7). Solo lee: abrir el
// enlace nunca cancela. Filtra siempre por la barbería y por el hash del token (constitución I).

/** Cita de la barbería con ese token, o null. Nombres de servicio y barbero aunque estén inactivos. */
export async function findByToken(barbershop: PublicBarbershop, token: string) {
  // Una sola sentencia con los nombres por LEFT JOIN (sin N+1). El join por id basta: la FK compuesta
  // garantiza que barbero y servicio son de la misma barbería que la cita.
  const [row] = await withService((tx) =>
    tx
      .select({
        startsAt: appointments.startsAt,
        status: appointments.status,
        serviceDurationMinutes: appointments.serviceDurationMinutes,
        servicePrice: appointments.servicePrice,
        serviceName: services.name,
        barberName: barbers.name,
      })
      .from(appointments)
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .leftJoin(barbers, eq(barbers.id, appointments.barberId))
      .where(and(eq(appointments.barbershopId, barbershop.id), eq(appointments.cancelTokenHash, hashToken(token))))
      .limit(1),
  );
  return row ?? null;
}

type FoundAppointment = NonNullable<Awaited<ReturnType<typeof findByToken>>>;

function toDetails(appointment: FoundAppointment, barbershop: PublicBarbershop): CancellationDetails {
  return {
    serviceName: appointment.serviceName ?? "",
    barberName: appointment.barberName ?? "",
    startsAtLabel: formatDateTime(appointment.startsAt, barbershop.timezone),
    durationMinutes: appointment.serviceDurationMinutes,
    priceLabel: formatPrice(appointment.servicePrice),
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
  if (appointment.startsAt <= now) return { status: "past", details };
  return { status: "active", details };
}

