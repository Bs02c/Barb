import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getPublicBarbershop } from "@/lib/barbershops";
import { MESSAGES } from "@/lib/booking/messages";
import { getBookingCatalog } from "@/lib/booking/queries";

// Página pública de una barbería. Se llega aquí desde src/proxy.ts:
// labarberia.midominio.com → /s/labarberia. Es indexable; el flujo de /reservar no.

export async function generateMetadata(props: PageProps<"/s/[subdomain]">): Promise<Metadata> {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) return {}; // el título lo pone not-found.tsx
  return {
    title: barbershop.name,
    description: `Reserva tu cita en ${barbershop.name}.`,
  };
}

export default async function BarbershopPage(props: PageProps<"/s/[subdomain]">) {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  // Sin servicios activos o sin barberos activos con horario no hay nada que reservar (caso límite).
  const { bookable: canBook } = await getBookingCatalog(barbershop);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{barbershop.name}</h1>
        <p className="text-muted-foreground">
          {canBook ? "Elige servicio, barbero y hora en pocos pasos." : MESSAGES.noSchedule}
        </p>
      </div>
      {canBook && (
        <Link href="/reservar" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Reservar cita
        </Link>
      )}
      <Link
        href="/privacidad"
        className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Política de tratamiento de datos
      </Link>
    </main>
  );
}
