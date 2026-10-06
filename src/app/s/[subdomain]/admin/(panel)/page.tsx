import type { Metadata } from "next";
import Link from "next/link";
import { AgendaTable, type AgendaRow } from "@/components/admin/agenda-table";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { agendaParamsSchema } from "@/lib/admin/schemas";
import { listAppointmentsForDay, listBarbers, listServices } from "@/lib/admin/queries";
import { addDaysToLocalDate, formatLocalDate, formatTime, toLocalDate } from "@/lib/time";
import { getPanelContext } from "./_lib/panel-context";

export const metadata: Metadata = { title: "Agenda" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Enlace a la agenda de un día, conservando el barbero elegido. */
function agendaHref(dia: string, barbero?: string): string {
  const search = new URLSearchParams({ dia });
  if (barbero) search.set("barbero", barbero);
  return `/admin?${search.toString()}`;
}

export default async function AgendaPage(props: PageProps<"/s/[subdomain]/admin">) {
  const { subdomain } = await props.params;
  const query = await props.searchParams;
  const context = await getPanelContext(subdomain);
  if (!context) return null;
  const { barbershop } = context;

  // Un parámetro inválido se ignora: se muestra hoy y todos los barberos.
  const params = agendaParamsSchema.parse({ dia: first(query.dia), barbero: first(query.barbero) });
  const today = toLocalDate(new Date(), barbershop.timezone);
  const day = params.dia ?? today;

  const [barbers, services] = await Promise.all([listBarbers(), listServices()]);
  // Si el uuid no es de un barbero de esta barbería, se ignora: "Todos los barberos".
  const barberId = barbers.some((b) => b.id === params.barbero) ? params.barbero : undefined;
  const appointments = await listAppointmentsForDay(barbershop, day, barberId);
  const hasActiveBarber = barbers.some((b) => b.is_active);
  const hasActiveService = services.some((s) => s.is_active);

  const now = new Date();
  const rows: AgendaRow[] = appointments.map((a) => ({
    id: a.id,
    timeRange: `${formatTime(a.startsAt, barbershop.timezone)}–${formatTime(a.endsAt, barbershop.timezone)}`,
    startLabel: formatTime(a.startsAt, barbershop.timezone),
    status: a.status,
    cancellable: a.status === "active" && new Date(a.startsAt) > now,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    barberName: a.barberName,
    serviceName: a.serviceName,
  }));

  const navLink = buttonVariants({ variant: "outline" });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="text-muted-foreground first-letter:uppercase">{formatLocalDate(day)}</p>
      </header>

      {(!hasActiveBarber || !hasActiveService) && (
        <p className="text-muted-foreground">
          Para recibir reservas necesitas al menos un barbero activo con horario y un servicio activo.
        </p>
      )}

      <nav aria-label="Cambiar de día" className="flex flex-wrap gap-2">
        <Link href={agendaHref(addDaysToLocalDate(day, -1), barberId)} className={navLink}>
          Día anterior
        </Link>
        <Link href={agendaHref(today, barberId)} className={navLink}>
          Hoy
        </Link>
        <Link href={agendaHref(addDaysToLocalDate(day, 1), barberId)} className={navLink}>
          Día siguiente
        </Link>
      </nav>

      <form
        method="get"
        key={`${day}-${barberId ?? ""}`}
        className="grid items-end gap-4 sm:grid-cols-[auto_1fr_auto]"
      >
        <TextField label="Día" name="dia" type="date" required defaultValue={day} />
        <SelectField label="Barbero" name="barbero" defaultValue={barberId ?? ""}>
          <option value="">Todos los barberos</option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>
              {barber.name}
              {barber.is_active ? "" : " (inactivo)"}
            </option>
          ))}
        </SelectField>
        <Button type="submit">Ver</Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-muted-foreground">
          No hay citas este día.
        </p>
      ) : (
        <AgendaTable subdomain={subdomain} rows={rows} />
      )}
    </div>
  );
}
