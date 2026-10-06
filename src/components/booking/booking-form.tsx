"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { SubmitButton, TextField } from "@/components/forms/fields";
import { createBooking } from "@/lib/booking/actions";
import { initialBookingState, type BookingResult, type BookingSummary } from "@/lib/booking/booking-state";
import { MESSAGES } from "@/lib/booking/messages";
import { bookingSchema } from "@/lib/booking/schemas";
import { cn } from "@/lib/utils";
import { toFieldErrors } from "@/lib/validation";

// Paso 4 de la reserva: datos del cliente, consentimiento y confirmación (spec 002, FR-010 a FR-012).
// Se envía con onSubmit (no con `action`) para que React no vacíe los campos si hay errores,
// igual que los formularios del panel (use-admin-form.ts). method="post" evita que un envío
// anterior a la hidratación ponga los datos personales en la URL.

type Props = {
  subdomain: string;
  serviceId: string;
  /** uuid del barbero o "pronto": el servidor vuelve a asignar barbero al confirmar. */
  barberId: string;
  startsAt: string;
  /** Paso 3 conservando servicio y barbero, para elegir otra hora si la elegida se ocupó. */
  slotsHref: string;
  /** Cabecera del paso (progreso, "Atrás" y resumen); se oculta al confirmar. */
  header: ReactNode;
};

// Mismo formato que devuelve el servidor, para mostrar los errores igual.
function clientErrors(formData: FormData): BookingResult | null {
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return null;
  return { ok: false, code: "invalid", message: MESSAGES.invalid, fieldErrors: toFieldErrors(parsed.error) };
}

export function BookingForm({ subdomain, serviceId, barberId, startsAt, slotsHref, header }: Props) {
  const [state, dispatch, pending] = useActionState(
    async (prev: BookingResult | null, formData: FormData) =>
      clientErrors(formData) ?? (await createBooking(subdomain, prev, formData)),
    initialBookingState,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  if (state?.ok) return <Confirmation summary={state.summary} />;

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <>
      {header}
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="service_id" value={serviceId} />
        <input type="hidden" name="barber_id" value={barberId} />
        <input type="hidden" name="starts_at" value={startsAt} />

        <TextField
          label="Nombre"
          name="customer_name"
          autoComplete="name"
          maxLength={100}
          required
          errors={fieldErrors?.customer_name}
        />
        <TextField
          label="Número de contacto"
          name="customer_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Celular, por ejemplo 300 123 4567."
          required
          errors={fieldErrors?.customer_phone}
        />
        <TextField
          label="Correo"
          name="customer_email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          errors={fieldErrors?.customer_email}
        />

        <ConsentField errors={fieldErrors?.consent} />

        {/* Honeypot (FR-012): invisible para personas y lectores de pantalla; los bots lo rellenan. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={`${subdomain}-website`}>Sitio web</label>
          <input id={`${subdomain}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <ResultMessage state={state} slotsHref={slotsHref} />

        <SubmitButton pending={pending} pendingLabel="Reservando…" size="lg" className="w-full">
          Reservar cita
        </SubmitButton>
      </form>
    </>
  );
}

function ConsentField({ errors }: { errors?: string[] }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        {/* La casilla está dentro de un área de 44 px para el dedo. */}
        <span className="-m-3 flex size-11 shrink-0 items-center justify-center">
          <input
            id={id}
            name="consent"
            type="checkbox"
            required
            aria-invalid={errors?.length ? true : undefined}
            aria-describedby={errors?.length ? errorId : undefined}
            className="size-5 rounded-sm accent-selection outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </span>
        <label htmlFor={id} className="text-sm leading-normal">
          Autorizo el tratamiento de mis datos personales para gestionar mi cita, según la{" "}
          <a
            href="/privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-medium text-selection underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            política de tratamiento de datos
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
          .
        </label>
      </div>
      {errors?.length ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{errors.join(" ")}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Error general del último envío; si la hora se ocupó, enlace para elegir otra. */
function ResultMessage({ state, slotsHref }: { state: BookingResult | null; slotsHref: string }) {
  return (
    <div role="status" aria-live="polite">
      {state && !state.ok && (
        <div className="flex flex-col gap-2 text-sm font-medium text-destructive">
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </p>
          {state.code === "slot_taken" && (
            <Link
              href={slotsHref}
              className="ml-6 w-fit rounded-sm text-selection underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Elegir otra hora
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Pantalla final. Con summary null (envío descartado en silencio) se muestra un texto genérico. */
function Confirmation({ summary }: { summary: BookingSummary | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Lleva el foco al título para que el lector de pantalla anuncie el resultado.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-success">
        <CircleCheck className="size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {summary ? "Cita confirmada" : "Hemos recibido tu reserva."}
        </h2>
      </div>
      {summary && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4">
          <SummaryRow label="Servicio" value={summary.serviceName} />
          <SummaryRow label="Barbero" value={summary.barberName} />
          <SummaryRow label="Fecha y hora" value={summary.startsAtLabel} />
          <SummaryRow label="Duración" value={`${summary.durationMinutes} min`} />
          <SummaryRow label="Precio" value={summary.priceLabel} />
        </dl>
      )}
      <Link
        href="/"
        className={cn(
          "w-fit rounded-sm font-medium text-selection underline underline-offset-4 outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        Volver al inicio
      </Link>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
