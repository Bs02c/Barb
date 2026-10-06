import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CancelForm } from "@/components/cancellation/cancel-form";
import { BookingSummary, EmptyState } from "@/components/booking/step-layout";
import { getPublicBarbershop } from "@/lib/barbershops";
import { getCancellation } from "@/lib/cancellation/queries";
import { resolveTenant, ROOT_DOMAIN } from "@/lib/tenant";
import { CANCEL_MESSAGES } from "@/lib/cancellation/messages";
import type { CancellationDetails } from "@/lib/cancellation/cancellation-state";

// Cancelación con enlace seguro (spec 003). El token va en la URL: la página no se indexa y
// no envía Referer, para que el token no salga hacia otros sitios. La lectura no modifica nada:
// cancelar solo ocurre al pulsar el botón (POST), no al abrir el enlace.

export async function generateMetadata(
  props: PageProps<"/s/[subdomain]/cancelar/[token]">,
): Promise<Metadata> {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  return {
    title: barbershop ? `Cancelar cita · ${barbershop.name}` : "Cancelar cita",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function summaryItems(details: CancellationDetails) {
  return [
    { label: "Servicio", value: details.serviceName },
    { label: "Barbero", value: details.barberName },
    { label: "Fecha y hora", value: details.startsAtLabel },
    { label: "Duración", value: `${details.durationMinutes} min` },
    { label: "Precio", value: details.priceLabel },
  ];
}

export default async function CancelPage(props: PageProps<"/s/[subdomain]/cancelar/[token]">) {
  const { subdomain, token } = await props.params;
  // Defensa en profundidad (revisión fase 5, SEC-001): la barbería sale del subdominio, pero el Host
  // real de la petición debe coincidir con el de la ruta, igual que en la server action.
  const tenant = resolveTenant((await headers()).get("host"), ROOT_DOMAIN);
  if (tenant.kind !== "tenant" || tenant.subdomain !== subdomain) notFound();
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  const view = await getCancellation(barbershop, token);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold">{barbershop.name}</p>
        <h1 className="font-display text-3xl font-bold">
          {view.status === "active" ? "Cancelar cita" : "Tu cita"}
        </h1>
      </header>
      {view.status === "active" && (
        <CancelForm subdomain={subdomain} token={token} items={summaryItems(view.details)} />
      )}
      {view.status === "already_cancelled" && (
        <>
          <EmptyState
            message={CANCEL_MESSAGES.alreadyCancelled}
            action={{ href: "/reservar", label: "Reservar otra cita" }}
          />
          <BookingSummary items={summaryItems(view.details)} />
        </>
      )}
      {view.status === "past" && (
        <>
          <EmptyState message={CANCEL_MESSAGES.past} />
          <BookingSummary items={summaryItems(view.details)} />
        </>
      )}
      {view.status === "invalid" && (
        <EmptyState message={CANCEL_MESSAGES.invalid} action={{ href: "/", label: "Ir a la barbería" }} />
      )}
    </main>
  );
}
