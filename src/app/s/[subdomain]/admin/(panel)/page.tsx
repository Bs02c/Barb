import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, ChevronRight, Clock, Scissors, Users, type LucideIcon } from "lucide-react";
import { listBarbers, listServices } from "@/lib/admin/queries";
import { getPanelContext } from "./_lib/panel-context";

export const metadata: Metadata = { title: "Panel" };

const SECTIONS: { href: string; title: string; description: string; icon: LucideIcon }[] = [
  { href: "/admin/barberos", title: "Barberos", description: "Añade, renombra o desactiva barberos.", icon: Users },
  { href: "/admin/servicios", title: "Servicios", description: "Duración y precio de cada servicio.", icon: Scissors },
  { href: "/admin/horarios", title: "Horarios", description: "Horario semanal de cada barbero.", icon: Clock },
  { href: "/admin/bloqueos", title: "Bloqueos", description: "Descansos, vacaciones y ausencias.", icon: CalendarOff },
];

export default async function PanelHomePage(props: PageProps<"/s/[subdomain]/admin">) {
  const { subdomain } = await props.params;
  if (!(await getPanelContext(subdomain))) return null;

  const [barbers, services] = await Promise.all([listBarbers(), listServices()]);
  const activeBarbers = barbers.filter((b) => b.is_active).length;
  const activeServices = services.filter((s) => s.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>

      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">Barberos activos</dt>
          <dd className="text-3xl font-semibold">{activeBarbers}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">Servicios activos</dt>
          <dd className="text-3xl font-semibold">{activeServices}</dd>
        </div>
      </dl>

      {(activeBarbers === 0 || activeServices === 0) && (
        <p className="text-muted-foreground">
          Para recibir reservas necesitas al menos un barbero activo con horario y un servicio activo.
        </p>
      )}

      <nav aria-label="Secciones del panel">
        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(({ href, title, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-11 items-center gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-5 shrink-0 text-selection" strokeWidth={1.75} aria-hidden="true" />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
