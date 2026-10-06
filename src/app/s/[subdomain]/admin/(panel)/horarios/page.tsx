import type { Metadata } from "next";
import Link from "next/link";
import { AddSlotForm, ScheduleList, type BarberSchedule } from "@/components/admin/schedule-manager";
import { listBarbers, listScheduleSlots } from "@/lib/admin/queries";
import { formatTimeOfDay, WEEKDAYS } from "@/lib/time";
import { getPanelContext } from "../_lib/panel-context";

export const metadata: Metadata = { title: "Horarios" };

export default async function SchedulesPage(props: PageProps<"/s/[subdomain]/admin/horarios">) {
  const { subdomain } = await props.params;
  if (!(await getPanelContext(subdomain))) return null;

  const [barbers, slots] = await Promise.all([listBarbers(), listScheduleSlots()]);

  // Horario de cada barbero agrupado por día (lunes a domingo), con las horas ya formateadas.
  const schedules: BarberSchedule[] = barbers.map((barber) => ({
    ...barber,
    days: WEEKDAYS.map((day) => ({
      weekday: day.value,
      label: day.label,
      slots: slots
        .filter((slot) => slot.barber_id === barber.id && slot.weekday === day.value)
        .map((slot) => ({
          id: slot.id,
          label: `${formatTimeOfDay(slot.start_time)} – ${formatTimeOfDay(slot.end_time)}`,
        })),
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Horarios</h1>

      {barbers.length === 0 ? (
        <p className="text-muted-foreground">
          Aún no hay barberos.{" "}
          <Link href="/admin/barberos" className="font-medium text-selection underline underline-offset-4">
            Añade el primero
          </Link>{" "}
          y luego vuelve aquí para asignarle su horario.
        </p>
      ) : (
        <>
          <section aria-labelledby="add-slot" className="rounded-lg border bg-card p-4 md:p-6">
            <h2 id="add-slot" className="mb-1 text-lg font-semibold">
              Añadir tramo
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Hora local de la barbería. Para un descanso a mediodía, añade dos tramos el mismo día.
            </p>
            <AddSlotForm subdomain={subdomain} barbers={barbers} />
          </section>

          <section aria-labelledby="schedule-list" className="flex flex-col gap-2">
            <h2 id="schedule-list" className="text-lg font-semibold">
              Horario semanal
            </h2>
            <ScheduleList subdomain={subdomain} schedules={schedules} />
          </section>
        </>
      )}
    </div>
  );
}
