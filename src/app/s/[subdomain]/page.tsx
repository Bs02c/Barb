import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBarbershop } from "@/lib/barbershops";

// Página pública de una barbería. Se llega aquí desde src/proxy.ts:
// labarberia.midominio.com → /s/labarberia. La reserva llega en la fase 4.

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

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">{barbershop.name}</h1>
      <p className="text-muted-foreground">Muy pronto podrás reservar tu cita aquí.</p>
    </main>
  );
}
