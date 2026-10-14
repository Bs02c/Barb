import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HoursList, ServiceCard, StorefrontHero } from "@/components/storefront/storefront";
import { buttonVariants } from "@/components/ui/button";
import { getPublicBarbershop } from "@/lib/barbershops";
import { MESSAGES } from "@/lib/booking/messages";
import { getBookingCatalog } from "@/lib/booking/queries";
import { openingStatus, todayWeekday } from "@/lib/storefront/hours";

// Portada pública de una barbería (spec 006). Se llega aquí desde src/proxy.ts:
// labarberia.midominio.com → /s/labarberia. Es indexable; el flujo de /reservar no.

export async function generateMetadata(props: PageProps<"/s/[subdomain]">): Promise<Metadata> {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) return {}; // el título lo pone not-found.tsx
  return {
    title: barbershop.name,
    description: barbershop.description ?? `Reserva tu cita en ${barbershop.name}.`,
  };
}

export default async function BarbershopPage(props: PageProps<"/s/[subdomain]">) {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  const { services, weeklyHours, bookable } = await getBookingCatalog(barbershop);
  const now = new Date(); // una sola vez: estado y "hoy" no pueden discrepar
  const status = openingStatus(weeklyHours, now, barbershop.timezone);
  const today = todayWeekday(now, barbershop.timezone);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-6 md:max-w-2xl md:py-10">
      <StorefrontHero
        name={barbershop.name}
        description={barbershop.description}
        address={barbershop.address}
        status={status}
      />

      {/* Sin servicios, el aviso va en su sección; "sin horarios" solo si hay servicios pero nadie atiende
          (revisión spec 006, MAINT-001). */}
      {bookable ? (
        <Link href="/reservar" className={buttonVariants({ size: "lg", className: "h-12 w-full text-base" })}>
          Reservar lo más pronto
        </Link>
      ) : (
        services.length > 0 && <p className="text-muted-foreground">{MESSAGES.noSchedule}</p>
      )}

      <section aria-labelledby="servicios" className="flex flex-col gap-3">
        <h2 id="servicios" className="text-xl font-semibold">
          Servicios
        </h2>
        {services.length === 0 ? (
          <p className="text-muted-foreground">Esta barbería aún no tiene servicios para reservar.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} bookable={bookable} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="horario" className="flex flex-col gap-3">
        <h2 id="horario" className="text-xl font-semibold">
          Horario
        </h2>
        <HoursList hours={weeklyHours} today={today} />
      </section>

      <footer className="text-center">
        <Link
          href="/privacidad"
          className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Política de tratamiento de datos
        </Link>
      </footer>
    </main>
  );
}
