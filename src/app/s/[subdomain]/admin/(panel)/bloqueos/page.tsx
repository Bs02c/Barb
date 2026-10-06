import type { Metadata } from "next";
import Link from "next/link";
import { AddBlockForm, BlockList, type BlockRow } from "@/components/admin/blocks-manager";
import { listBarbers, listUpcomingBlocks } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/time";
import { getPanelContext } from "../_lib/panel-context";

export const metadata: Metadata = { title: "Bloqueos" };

export default async function BlocksPage(props: PageProps<"/s/[subdomain]/admin/bloqueos">) {
  const { subdomain } = await props.params;
  const context = await getPanelContext(subdomain);
  if (!context) return null;
  const { timezone } = context.barbershop;

  const [barbers, upcoming] = await Promise.all([listBarbers(), listUpcomingBlocks()]);
  const barberNames = new Map(barbers.map((barber) => [barber.id, barber.name]));

  // Fechas en la hora local de la barbería, formateadas en el servidor (src/lib/time.ts).
  const blocks: BlockRow[] = upcoming.map((block) => ({
    id: block.id,
    barberName: barberNames.get(block.barber_id) ?? "Barbero",
    startsLabel: formatDateTime(block.starts_at, timezone),
    endsLabel: formatDateTime(block.ends_at, timezone),
    reason: block.reason,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Bloqueos</h1>

      {barbers.length === 0 ? (
        <p className="text-muted-foreground">
          Aún no hay barberos.{" "}
          <Link href="/admin/barberos" className="font-medium text-selection underline underline-offset-4">
            Añade el primero
          </Link>{" "}
          para poder bloquear su tiempo.
        </p>
      ) : (
        <>
          <section aria-labelledby="add-block" className="rounded-lg border bg-card p-4 md:p-6">
            <h2 id="add-block" className="mb-1 text-lg font-semibold">
              Añadir bloqueo
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Durante un bloqueo el barbero no recibe reservas: descansos, vacaciones o ausencias.
            </p>
            <AddBlockForm subdomain={subdomain} barbers={barbers} timezone={timezone} />
          </section>

          <section aria-labelledby="block-list" className="flex flex-col gap-2">
            <h2 id="block-list" className="text-lg font-semibold">
              Próximos bloqueos
            </h2>
            <BlockList subdomain={subdomain} blocks={blocks} />
          </section>
        </>
      )}
    </div>
  );
}
