import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import type { PublicBarbershop } from "@/lib/barbershops";
import { cancelUrl, generateCancelToken, hashToken } from "@/lib/cancellation/token";
import { withService } from "@/lib/db/client";
import { toDbError } from "@/lib/db/errors";
import { appointments } from "@/lib/db/schema";
import type { ConfirmationData } from "@/lib/email/confirmation";
import { formatDateTime, formatPrice, toLocalDate } from "@/lib/time";
import type { BookingResult } from "./booking-state";
import { MESSAGES } from "./messages";
import { loadSlots, resolveSelection } from "./queries";
import { EARLIEST, type BookingInput } from "./schemas";

// Reserva de una cita desde la web pública (spec 002, research §4).
// Separado de la server action para poder probarlo en tests de integración.

// FR-013. El trigger appointments_phone_limit aplica el mismo tope en la base de datos con
// reservas simultáneas: cambiar ambos a la vez.
export const MAX_ACTIVE_PER_PHONE = 2;

const SLOT_TAKEN: BookingResult = { ok: false, code: "slot_taken", message: MESSAGES.slotTaken };
const UNAVAILABLE: BookingResult = { ok: false, code: "unavailable", message: MESSAGES.unavailable };
const LIMIT_REACHED: BookingResult = { ok: false, code: "limit_reached", message: MESSAGES.limitReached };

/**
 * Resultado para el navegador más, si la cita se creó, los datos del correo de confirmación. El
 * token de cancelación solo viaja dentro de `confirmation.cancelUrl`, que nunca llega al navegador.
 */
export type BookingOutcome = { result: BookingResult; confirmation?: ConfirmationData };

type Attempt = BookingOutcome | { retry: true };

async function attempt(barbershop: PublicBarbershop, input: BookingInput, now: Date): Promise<Attempt> {
  // 1. Servicio y barbero(s) activos DE ESTA barbería (constitución I).
  const selection = await resolveSelection(barbershop, input.service_id, input.barber_id);
  if (!selection) return { result: UNAVAILABLE };

  const localDate = toLocalDate(input.starts_at, barbershop.timezone);

  // 2 y 3 en paralelo (revisión fase 4, PERF-006):
  // - revalidar la hora con datos actuales: horario, bloqueos, citas, antelación y horizonte (FR-008);
  // - tope de citas activas futuras por número en esta barbería (mensaje rápido; el trigger lo garantiza).
  const [slots, [active]] = await Promise.all([
    loadSlots(barbershop, selection, { now, fromDate: localDate, days: 1 }),
    withService((tx) =>
      tx
        .select({ count: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.barbershopId, barbershop.id),
            eq(appointments.customerPhone, input.customer_phone),
            eq(appointments.status, "active"),
            gt(appointments.startsAt, now),
          ),
        ),
    ),
  ]);

  const requested = new Date(input.starts_at).toISOString();
  const slot = slots.find((s) => s.startsAt === requested);
  if (!slot) return { result: SLOT_TAKEN };
  if (active.count >= MAX_ACTIVE_PER_PHONE) return { result: LIMIT_REACHED };

  // 4. Insertar con copia de duración y precio y fecha de consentimiento (FR-011).
  const { service } = selection;
  const startsAt = new Date(slot.startsAt);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  // Token de cancelación nuevo en cada intento; en la base solo su hash (spec 003, FR-003).
  const token = generateCancelToken();
  try {
    await withService((tx) =>
      tx.insert(appointments).values({
        barbershopId: barbershop.id,
        barberId: slot.barberId,
        serviceId: service.id,
        startsAt,
        endsAt,
        serviceDurationMinutes: service.durationMinutes,
        servicePrice: String(service.price),
        customerName: input.customer_name,
        customerPhone: input.customer_phone,
        customerEmail: input.customer_email,
        dataConsentAt: now,
        cancelTokenHash: hashToken(token),
      }),
    );
  } catch (error) {
    return fromDatabase(error, input);
  }

  const barberName = selection.barbers.find((b) => b.id === slot.barberId)?.name ?? "";
  const summary = {
    serviceName: service.name,
    barberName,
    startsAtLabel: formatDateTime(startsAt, barbershop.timezone),
    durationMinutes: service.durationMinutes,
    priceLabel: formatPrice(service.price),
  };
  return {
    result: { ok: true, summary },
    confirmation: {
      to: input.customer_email,
      barbershopName: barbershop.name,
      summary,
      cancelUrl: cancelUrl(barbershop.subdomain, token),
    },
  };
}

/** Decide solo por código y restricción (spec 005, research §8); cualquier otro error sube tal cual. */
function fromDatabase(error: unknown, input: BookingInput): Attempt {
  const db = toDbError(error);
  // El tope por número ganó la carrera: el conteo previo vio menos citas que el trigger.
  if (db?.constraint === "appointments_phone_limit") return { result: LIMIT_REACHED };
  // Otra reserva tomó el hueco. Con "Lo más pronto" se reintenta: puede quedar otro barbero libre
  // a esa hora (research §3; revisión fase 4, PERF-005).
  if (db?.code === "23P01") return input.barber_id === EARLIEST ? { retry: true } : { result: SLOT_TAKEN };
  if (db?.code === "40P01") return { retry: true }; // bloqueo mutuo entre reservas simultáneas
  throw error;
}

/**
 * Reserva una cita. Reintenta una vez ante un bloqueo mutuo de Postgres (40P01, dos reservas
 * simultáneas del mismo hueco) y, con "Lo más pronto", también cuando otra reserva ganó el barbero
 * asignado (23P01). El reintento ve la otra cita ya confirmada: asigna otro barbero libre o
 * responde "horario no disponible".
 */
export async function bookAppointment(
  barbershop: PublicBarbershop,
  input: BookingInput,
  now: Date = new Date(),
): Promise<BookingOutcome> {
  for (let i = 0; i < 2; i++) {
    const outcome = await attempt(barbershop, input, now);
    if (!("retry" in outcome)) return outcome;
  }
  return { result: SLOT_TAKEN };
}
