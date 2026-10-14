import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getPublicBarbershop } from "@/lib/barbershops";
import { withService } from "@/lib/db/client";
import { appointments } from "@/lib/db/schema";
import { logSafeError } from "@/lib/log";
import { resolveTenant, ROOT_DOMAIN } from "@/lib/tenant";
import type { CancelResult } from "./cancellation-state";
import { CANCEL_MESSAGES } from "./messages";
import { findByToken } from "./queries";
import { cancelTokenSchema } from "./schemas";
import { hashToken } from "./token";

const INVALID: CancelResult = { ok: false, code: "invalid", message: CANCEL_MESSAGES.invalid };

/**
 * Cancela la cita del enlace. La barbería se resuelve del `host` REAL de la petición, nunca de un
 * dato del navegador (constitución I; SEC-001 de la fase 4): `claimedSubdomain` solo se acepta si
 * coincide con el host. Un token de otra barbería es inválido.
 *
 * La cancelación es una sola sentencia condicionada (barbería + hash + activa + futura): dos
 * pulsaciones simultáneas cancelan una vez; la otra ve 0 filas y recibe `already_cancelled`.
 */
export async function submitCancellation(
  host: string | null,
  claimedSubdomain: string,
  token: string,
  now: Date = new Date(),
): Promise<CancelResult> {
  const tenant = resolveTenant(host, ROOT_DOMAIN);
  if (tenant.kind !== "tenant" || tenant.subdomain !== claimedSubdomain) return INVALID;
  if (!cancelTokenSchema.safeParse(token).success) return INVALID;
  const barbershop = await getPublicBarbershop(tenant.subdomain);
  if (!barbershop) return INVALID;

  try {
    const hash = hashToken(token);
    const cancelled = await withService((tx) =>
      tx
        .update(appointments)
        .set({ status: "cancelled", cancelledAt: now })
        .where(
          and(
            eq(appointments.barbershopId, barbershop.id),
            eq(appointments.cancelTokenHash, hash),
            eq(appointments.status, "active"),
            gt(appointments.startsAt, now),
          ),
        )
        .returning({ id: appointments.id }),
    );
    if (cancelled.length > 0) return { ok: true };

    // 0 filas: distinguir por qué para dar el mensaje correcto.
    const existing = await findByToken(barbershop, token);
    if (!existing) return INVALID;
    if (existing.status === "cancelled") {
      return { ok: false, code: "already_cancelled", message: CANCEL_MESSAGES.alreadyCancelled };
    }
    // Hoy una cita no cancelada con 0 filas actualizadas solo puede haber empezado ya. Si se añade
    // otro estado de cita, revisar esta rama (revisión fase 5, MAINT-010).
    return { ok: false, code: "past", message: CANCEL_MESSAGES.past };
  } catch (error) {
    // Solo código y mensaje: nunca el token ni datos del cliente (constitución VI).
    logSafeError("Error al cancelar la cita", error);
    return { ok: false, code: "server_error", message: CANCEL_MESSAGES.serverError };
  }
}
