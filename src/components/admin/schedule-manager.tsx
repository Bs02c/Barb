"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/admin/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";
import { addScheduleSlot, deleteScheduleSlot } from "@/lib/admin/actions";
import { scheduleSlotSchema } from "@/lib/admin/schemas";
import { WEEKDAYS } from "@/lib/time";

export type BarberOption = { id: string; name: string; is_active: boolean };

/** Horario de un barbero agrupado por día; las horas ya vienen formateadas del servidor. */
export type BarberSchedule = BarberOption & {
  days: { weekday: number; label: string; slots: { id: string; label: string }[] }[];
};

export function BarberSelectOptions({ barbers }: { barbers: BarberOption[] }) {
  return (
    <>
      <option value="">Elige un barbero</option>
      {barbers.map((barber) => (
        <option key={barber.id} value={barber.id}>
          {barber.is_active ? barber.name : `${barber.name} (inactivo)`}
        </option>
      ))}
    </>
  );
}

export function AddSlotForm({ subdomain, barbers }: { subdomain: string; barbers: BarberOption[] }) {
  const { state, pending, formRef, onSubmit } = useAdminForm({
    action: addScheduleSlot,
    subdomain,
    schema: scheduleSlotSchema,
    resetOnSuccess: true,
  });
  const errors = state.fieldErrors;

  return (
    <form method="post" ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Barbero" name="barber_id" required errors={errors?.barber_id}>
          <BarberSelectOptions barbers={barbers} />
        </SelectField>
        <SelectField label="Día" name="weekday" required errors={errors?.weekday}>
          <option value="">Elige un día</option>
          {WEEKDAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Inicio" name="start_time" type="time" required errors={errors?.start_time} />
        <TextField label="Fin" name="end_time" type="time" required errors={errors?.end_time} />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="sm:self-start">
        Añadir tramo
      </SubmitButton>
    </form>
  );
}

export function ScheduleList({ subdomain, schedules }: { subdomain: string; schedules: BarberSchedule[] }) {
  const [notice, setNotice] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={notice} />
      {schedules.map((barber) => {
        const hasSlots = barber.days.some((day) => day.slots.length > 0);
        return (
          <section key={barber.id} aria-labelledby={`horario-${barber.id}`} className="rounded-lg border bg-card p-4">
            <h3 id={`horario-${barber.id}`} className="flex items-center gap-2 text-base font-semibold">
              {barber.name}
              {!barber.is_active && <Badge variant="outline">Inactivo</Badge>}
            </h3>
            {!hasSlots ? (
              <p className="mt-2 text-muted-foreground">Aún no tiene horario. Añade su primer tramo con el formulario.</p>
            ) : (
              <dl className="mt-2 divide-y">
                {barber.days.map((day) => (
                  <div key={day.weekday} className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr] sm:items-center">
                    <dt className="font-medium">{day.label}</dt>
                    <dd>
                      {day.slots.length === 0 ? (
                        <span className="text-muted-foreground">Sin horario</span>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {day.slots.map((slot) => (
                            <li key={slot.id} className="flex items-center gap-1 rounded-lg border pl-3">
                              <span>{slot.label}</span>
                              <ConfirmDelete
                                subdomain={subdomain}
                                action={deleteScheduleSlot}
                                id={slot.id}
                                iconOnly
                                title="¿Eliminar este tramo?"
                                description={`${barber.name}, ${day.label.toLowerCase()} de ${slot.label}. Las citas ya reservadas no se cancelan.`}
                                triggerLabel={`Eliminar tramo de ${barber.name}, ${day.label} ${slot.label}`}
                                onResult={setNotice}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
