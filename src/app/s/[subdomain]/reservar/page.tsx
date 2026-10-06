import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking/booking-form";
import {
  BookingSummary,
  ChoiceCard,
  Chip,
  EmptyState,
  StepHeader,
  type SummaryItem,
} from "@/components/booking/step-layout";
import { getPublicBarbershop, type PublicBarbershop } from "@/lib/barbershops";
import { MESSAGES } from "@/lib/booking/messages";
import { getAvailability, getBookingCatalog } from "@/lib/booking/queries";
import { EARLIEST } from "@/lib/booking/schemas";

// Flujo de reserva pública (spec 002; research §6). Una sola página del servidor que decide el
// paso por los parámetros de la URL: servicio → barbero → dia → hora. Elegir es seguir un enlace,
// así "Atrás" (o el botón del navegador) conserva lo elegido en los pasos anteriores.
// Un parámetro inválido o de otra barbería deja al cliente en el paso anterior, sin error técnico.

export async function generateMetadata(props: PageProps<"/s/[subdomain]/reservar">): Promise<Metadata> {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  return {
    title: barbershop ? `Reservar cita · ${barbershop.name}` : "Reservar cita",
    robots: { index: false, follow: false }, // el flujo de reserva no se indexa (FR-016)
  };
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Params = { servicio?: string; barbero?: string; dia?: string; hora?: string };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** URL relativa del flujo con los parámetros dados (en el subdominio, /reservar). */
function bookingHref(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `/reservar?${query}` : "/reservar";
}

export default async function BookingPage(props: PageProps<"/s/[subdomain]/reservar">) {
  const { subdomain } = await props.params;
  const query = await props.searchParams;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold">{barbershop.name}</p>
        <h1 className="font-display text-3xl font-bold">Reservar cita</h1>
      </header>
      <BookingStep
        subdomain={subdomain}
        barbershop={barbershop}
        params={{
          servicio: first(query.servicio),
          barbero: first(query.barbero),
          dia: first(query.dia),
          hora: first(query.hora),
        }}
      />
    </main>
  );
}

async function BookingStep({
  subdomain,
  barbershop,
  params,
}: {
  subdomain: string;
  barbershop: PublicBarbershop;
  params: Params;
}) {
  const catalog = await getBookingCatalog(barbershop);
  if (!catalog.bookable) return <EmptyState message={MESSAGES.noSchedule} />;

  // Paso 1: servicio.
  const service = catalog.services.find((s) => s.id === params.servicio);
  if (!service) {
    return (
      <>
        <StepHeader step={1} title="Elige un servicio" backHref="/" />
        <ul className="flex flex-col gap-3">
          {catalog.services.map((s) => (
            <li key={s.id}>
              <ChoiceCard
                href={bookingHref({ servicio: s.id })}
                title={s.name}
                description={`${s.durationMinutes} min · ${s.priceLabel}`}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  const summary: SummaryItem[] = [
    { label: "Servicio", value: `${service.name} · ${service.durationMinutes} min · ${service.priceLabel}` },
  ];

  // Paso 2: barbero o "Lo más pronto".
  const isEarliest = params.barbero === EARLIEST;
  const barber = isEarliest ? null : catalog.barbers.find((b) => b.id === params.barbero);
  if (!isEarliest && !barber) {
    return (
      <>
        <StepHeader step={2} title="Elige un barbero" backHref={bookingHref({})} />
        <BookingSummary items={summary} />
        <ul className="flex flex-col gap-3">
          <li>
            <ChoiceCard
              href={bookingHref({ servicio: service.id, barbero: EARLIEST })}
              title="Lo más pronto"
              description="El primer horario libre con cualquier barbero"
              icon="clock"
            />
          </li>
          {catalog.barbers.map((b) => (
            <li key={b.id}>
              <ChoiceCard href={bookingHref({ servicio: service.id, barbero: b.id })} title={b.name} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  const barberParam = isEarliest ? EARLIEST : barber!.id;
  const barberStepHref = bookingHref({ servicio: service.id });
  summary.push({ label: "Barbero", value: isEarliest ? "Lo más pronto" : barber!.name });

  // Paso 3: día y hora, de una sola consulta. Null si la selección dejó de ser válida.
  const availability = await getAvailability(barbershop, service.id, barberParam);
  if (!availability) return <StepFallback href={barberStepHref} />;
  const { days, slotsByDay } = availability;

  // El día solo vale si está entre los días con horas libres; si no, paso 3 sin día elegido.
  const day =
    params.dia && LOCAL_DATE.test(params.dia) ? days.find((d) => d.localDate === params.dia) : undefined;
  const slots = day ? (slotsByDay.get(day.localDate) ?? []) : [];
  const slot = slots.find((s) => s.startsAt === params.hora);

  if (!day || !slot) {
    const base = { servicio: service.id, barbero: barberParam };
    return (
      <>
        <StepHeader step={3} title="Elige fecha y hora" backHref={barberStepHref} />
        <BookingSummary items={summary} />
        {days.length === 0 ? (
          <EmptyState
            message={isEarliest ? MESSAGES.noFreeSlots : MESSAGES.barberNoFreeSlots}
            action={isEarliest ? undefined : { href: barberStepHref, label: "Prueba con otro barbero" }}
          />
        ) : (
          <>
            <nav aria-label="Días disponibles">
              <ul className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <li key={d.localDate}>
                    <Chip href={bookingHref({ ...base, dia: d.localDate })} selected={d.localDate === day?.localDate}>
                      {d.label}
                    </Chip>
                  </li>
                ))}
              </ul>
            </nav>
            {day && (
              <section aria-labelledby="horas-title" className="flex flex-col gap-3">
                <h3 id="horas-title" className="font-semibold">
                  Horas disponibles el {day.label}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <li key={s.startsAt}>
                      <Chip href={bookingHref({ ...base, dia: day.localDate, hora: s.startsAt })}>{s.label}</Chip>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </>
    );
  }

  // Paso 4: datos del cliente. Con "Lo más pronto" se muestra el barbero que se asignaría;
  // el formulario sigue enviando "pronto" y el servidor vuelve a asignar al confirmar.
  const slotsHref = bookingHref({ servicio: service.id, barbero: barberParam, dia: day.localDate });
  const finalSummary: SummaryItem[] = [
    summary[0],
    { label: "Barbero", value: isEarliest ? slot.barberName : barber!.name },
    { label: "Fecha", value: day.label },
    { label: "Hora", value: slot.label },
  ];

  return (
    <BookingForm
      subdomain={subdomain}
      serviceId={service.id}
      barberId={barberParam}
      startsAt={slot.startsAt}
      slotsHref={slotsHref}
      header={
        <>
          <StepHeader step={4} title="Tus datos" backHref={slotsHref} />
          <BookingSummary items={finalSummary} />
        </>
      }
    />
  );
}

/** La selección dejó de ser válida entre consultas (p. ej. se desactivó un barbero): volver al paso 2. */
function StepFallback({ href }: { href: string }) {
  return (
    <EmptyState message={MESSAGES.unavailable} action={{ href, label: "Elegir de nuevo" }} />
  );
}
