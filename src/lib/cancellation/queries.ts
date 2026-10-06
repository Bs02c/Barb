import "server-only";
import type { PublicBarbershop } from "@/lib/barbershops";
import type { CancellationView } from "./cancellation-state";

/** Lectura para la página. Token con formato inválido → { status: "invalid" } sin consultar. */
export async function getCancellation(
  _barbershop: PublicBarbershop,
  _token: string,
  _now: Date = new Date(),
): Promise<CancellationView> {
  throw new Error("pendiente: T009"); // cuerpo provisional; el contrato es la firma
}
