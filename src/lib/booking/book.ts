import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { PublicBarbershop } from "@/lib/barbershops";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateTime, formatPrice, toLocalDate } from "@/lib/time";
import type { BookingResult } from "./booking-state";
import { MESSAGES } from "./messages";
import { loadSlots, resolveSelection } from "./queries";
import { EARLIEST, type BookingInput } from "./schemas";

// Reserva de una cita desde la web pública (spec 002, research §4).
// Separado de la server action para poder probarlo en tests de integración.

export const MAX_ACTIVE_PER_PHONE = 2; // FR-013

const SLOT_TAKEN: BookingResult = { ok: false, code: "slot_taken", message: MESSAGES.slotTaken };
const UNAVAILABLE: BookingResult = { ok: false, code: "unavailable", message: MESSAGES.unavailable };
const LIMIT_REACHED: BookingResult = { ok: false, code: "limit_reached", message: MESSAGES.limitReached };

type Attempt = { result: BookingResult } | { retry: true };

async function attempt(barbershop: PublicBarbershop, input: BookingInput, now: Date): Promise<Attempt> {
  // 1. Servicio y barbero(s) activos DE ESTA barbería (constitución I).
  const selection = await resolveSelection(barbershop, input.service_id, input.barber_id);
  if (!selection) return { result: UNAVAILABLE };

  const db = createServiceClient();
  const localDate = toLocalDate(input.starts_at, barbershop.timezone);

  // 2 y 3 en paralelo (revisión fase 4, PERF-006):
  // - revalidar la hora con datos actuales: horario, bloqueos, citas, antelación y horizonte (FR-008);
  // - tope de citas activas futuras por número en esta barbería (no atómico: research §4).
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
  });

  if (error) return fromDatabase(error, input);

  const barberName = selection.barbers.find((b) => b.id === slot.barberId)?.name ?? "";
  return {
    result: {
      ok: true,
      summary: {
        serviceName: service.name,
        barberName,
        startsAtLabel: formatDateTime(startsAt, barbershop.timezone),
        durationMinutes: service.durationMinutes,
        priceLabel: formatPrice(service.price),
      },
    },
  };
}

function fromDatabase(error: PostgrestError, input: BookingInput): Attempt {
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
): Promise<BookingResult> {
  for (let i = 0; i < 2; i++) {
    const outcome = await attempt(barbershop, input, now);
    if ("result" in outcome) return outcome.result;
  }
  return SLOT_TAKEN;
}
