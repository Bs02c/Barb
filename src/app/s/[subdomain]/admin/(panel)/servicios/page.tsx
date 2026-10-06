import type { Metadata } from "next";
import { AddServiceForm, ServiceList, type ServiceRow } from "@/components/admin/services-manager";
import { listServices } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/time";
import { getPanelContext } from "../_lib/panel-context";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage(props: PageProps<"/s/[subdomain]/admin/servicios">) {
  const { subdomain } = await props.params;
  if (!(await getPanelContext(subdomain))) return null;

  // El precio se formatea en el servidor para que el HTML no dependa del navegador.
  const services: ServiceRow[] = (await listServices()).map((service) => ({
    ...service,
    priceLabel: formatPrice(service.price),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Servicios</h1>

      <section aria-labelledby="add-service" className="rounded-lg border bg-card p-4 md:p-6">
        <h2 id="add-service" className="mb-4 text-lg font-semibold">
          Añadir servicio
        </h2>
        <AddServiceForm subdomain={subdomain} />
      </section>

      <section aria-labelledby="service-list" className="flex flex-col gap-2">
        <h2 id="service-list" className="text-lg font-semibold">
          Catálogo
        </h2>
        <p className="text-sm text-muted-foreground">
          Un servicio inactivo no se puede reservar, pero sus citas se conservan.
        </p>
        <ServiceList subdomain={subdomain} services={services} />
      </section>
    </div>
  );
}
