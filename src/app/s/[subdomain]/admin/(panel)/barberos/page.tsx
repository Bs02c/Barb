import type { Metadata } from "next";
import { AddBarberForm, BarberList } from "@/components/admin/barbers-manager";
import { listBarbers } from "@/lib/admin/queries";
import { getPanelContext } from "../_lib/panel-context";

export const metadata: Metadata = { title: "Barberos" };

export default async function BarbersPage(props: PageProps<"/s/[subdomain]/admin/barberos">) {
  const { subdomain } = await props.params;
  if (!(await getPanelContext(subdomain))) return null;

  const barbers = await listBarbers();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Barberos</h1>

      <section aria-labelledby="add-barber" className="rounded-lg border bg-card p-4 md:p-6">
        <h2 id="add-barber" className="mb-4 text-lg font-semibold">
          Añadir barbero
        </h2>
        <AddBarberForm subdomain={subdomain} />
      </section>

      <section aria-labelledby="barber-list" className="flex flex-col gap-2">
        <h2 id="barber-list" className="text-lg font-semibold">
          Equipo
        </h2>
        <p className="text-sm text-muted-foreground">
          Un barbero inactivo no aparece en la reserva pero conserva sus citas.
        </p>
        <BarberList subdomain={subdomain} barbers={barbers} />
      </section>
    </div>
  );
}
