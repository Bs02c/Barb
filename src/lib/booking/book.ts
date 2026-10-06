import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { PublicBarbershop } from "@/lib/barbershops";
import { cancelUrl, generateCancelToken, hashToken } from "@/lib/cancellation/token";
import type { ConfirmationData } from "@/lib/email/confirmation";
import { createServiceClient } from "@/lib/supabase/service";
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

  const db = createServiceClient();
  const localDate = toLocalDate(input.starts_at, barbershop.timezone);

  // 2 y 3 en paralelo (revisión fase 4, PERF-006):
  // - revalidar la hora con datos actuales: horario, bloqueos, citas, antelación y horizonte (FR-008);
  // - tope de citas activas futuras por número en esta barbería (mensaje rápido; el trigger lo garantiza).
  const [slots, active] = await Promise.all([
    loadSlots(barbershop, selection, { now, fromDate: localDate, days: 1 }),
    db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershop.id)
      .eq("customer_phone", input.customer_phone)
      .eq("status", "active")
      .gt("starts_at", now.toISOString()),
  ]);
  if (active.error) throw active.error;

  const requested = new Date(input.starts_at).toISOString();
  const slot = slots.find((s) => s.startsAt === requested);
  if (!slot) return { result: SLOT_TAKEN };
  if ((active.count ?? 0) >= MAX_ACTIVE_PER_PHONE) return { result: LIMIT_REACHED };

  // 4. Insertar con copia de duración y precio y fecha de consentimiento (FR-011).
  const { service } = selection;
  const startsAt = new Date(slot.startsAt);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  // Token de cancelación nuevo en cada intento; en la base solo su hash (spec 003, FR-003).
  const token = generateCancelToken();
  const { error } = await db.from("appointments").insert({
    barbershop_id: barbershop.id,
    barber_id: slot.barberId,
    service_id: service.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    service_duration_minutes: service.durationMinutes,
    service_price: service.price,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone,
    customer_email: input.customer_email,
    data_consent_at: now.toISOString(),
    cancel_token_hash: hashToken(token),
  });

  if (error) return fromDatabase(error, input);

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

function fromDatabase(error: PostgrestError, input: BookingInput): Attempt {
  // El tope por número ganó la carrera: el conteo previo vio menos citas que el trigger.
  if (error.code === "23514" && error.message.includes("appointments_phone_limit")) return { result: LIMIT_REACHED };
  // Otra reserva tomó el hueco. Con "Lo más pronto" se reintenta: puede quedar otro barbero libre
  // a esa hora (research §3; revisión fase 4, PERF-005).
  if (error.code === "23P01") return input.barber_id === EARLIEST ? { retry: true } : { result: SLOT_TAKEN };
  if (error.code === "40P01") return { retry: true }; // bloqueo mutuo entre reservas simultáneas
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
