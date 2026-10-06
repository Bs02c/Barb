"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { BookingSummary, type SummaryItem } from "@/components/booking/step-layout";
import { SubmitButton } from "@/components/forms/fields";
import { cancelAppointment } from "@/lib/cancellation/actions";
import { initialCancelState } from "@/lib/cancellation/cancellation-state";
import { CANCEL_MESSAGES } from "@/lib/cancellation/messages";

// Botón de cancelación (spec 003, contrato). Es un POST: abrir el enlace nunca cancela.

export function CancelForm({
  subdomain,
  token,
  items,
}: {
  subdomain: string;
  token: string;
  items: SummaryItem[];
}) {
  const [state, action, pending] = useActionState(
    cancelAppointment.bind(null, subdomain, token),
    initialCancelState,
  );

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex items-start gap-2 text-success">
          <CircleCheck className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <p className="font-medium">{CANCEL_MESSAGES.cancelled}</p>
        </div>
        <Link
          href="/reservar"
          className="w-fit rounded-sm font-medium text-selection underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Reservar otra cita
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <BookingSummary items={items} />
      {state && !state.ok && (
        <div role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}
      <SubmitButton pending={pending} pendingLabel="Cancelando…" variant="destructive" size="lg" className="w-full">
        Cancelar cita
      </SubmitButton>
    </form>
  );
}
