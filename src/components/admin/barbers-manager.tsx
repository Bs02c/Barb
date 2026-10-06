"use client";

import { useState } from "react";
import { Pencil, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { FormMessage, SubmitButton, TextField } from "@/components/admin/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";
import { createBarber, deleteBarber, renameBarber, setBarberActive } from "@/lib/admin/actions";
import { barberSchema } from "@/lib/admin/schemas";
import { cn } from "@/lib/utils";

export type BarberRow = { id: string; name: string; is_active: boolean };

export function AddBarberForm({ subdomain }: { subdomain: string }) {
  const { state, pending, formRef, onSubmit } = useAdminForm({
    action: createBarber,
    subdomain,
    schema: barberSchema,
    resetOnSuccess: true,
  });

  return (
    <form method="post" ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField label="Nombre" name="name" autoComplete="off" required maxLength={100} errors={state.fieldErrors?.name} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="sm:self-start">
        Añadir barbero
      </SubmitButton>
    </form>
  );
}

function BarberItem({
  subdomain,
  barber,
  onResult,
}: {
  subdomain: string;
  barber: BarberRow;
  onResult: (result: ActionState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const rename = useAdminForm({
    action: renameBarber,
    subdomain,
    schema: barberSchema,
    onResult: (result) => {
      if (result.ok) setEditing(false);
      onResult(result);
    },
  });
  const toggle = useAdminForm({ action: setBarberActive, subdomain, onResult });

  if (editing) {
    return (
      <li className="py-3">
        <form method="post" onSubmit={rename.onSubmit} noValidate className="flex flex-col gap-3">
          <input type="hidden" name="id" value={barber.id} />
          <TextField
            label={`Nuevo nombre para ${barber.name}`}
            name="name"
            defaultValue={barber.name}
            autoComplete="off"
            required
            maxLength={100}
            errors={rename.state.fieldErrors?.name}
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="secondary" pending={rename.pending}>
              Guardar
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={rename.pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-h-11 items-center gap-2">
        <span className={cn("text-base font-medium", !barber.is_active && "text-muted-foreground")}>
          {barber.name}
        </span>
        {!barber.is_active && <Badge variant="outline">Inactivo</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing(true)} aria-label={`Renombrar a ${barber.name}`}>
          <Pencil aria-hidden="true" />
          Renombrar
        </Button>
        <form method="post" onSubmit={toggle.onSubmit}>
          <input type="hidden" name="id" value={barber.id} />
          <input type="hidden" name="is_active" value={barber.is_active ? "false" : "true"} />
          <SubmitButton
            variant="outline"
            pending={toggle.pending}
            aria-label={`${barber.is_active ? "Desactivar" : "Activar"} a ${barber.name}`}
          >
            {barber.is_active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {barber.is_active ? "Desactivar" : "Activar"}
          </SubmitButton>
        </form>
        <ConfirmDelete
          subdomain={subdomain}
          action={deleteBarber}
          id={barber.id}
          title={`¿Eliminar a ${barber.name}?`}
          description="Se borran también su horario y sus bloqueos. Si ya tiene citas no se puede eliminar: desactívalo para que no reciba nuevas reservas."
          triggerLabel={`Eliminar a ${barber.name}`}
          onResult={onResult}
        />
      </div>
    </li>
  );
}

export function BarberList({ subdomain, barbers }: { subdomain: string; barbers: BarberRow[] }) {
  const [notice, setNotice] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={notice} />
      {barbers.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay barberos. Añade el primero.</p>
      ) : (
        <ul className="divide-y">
          {barbers.map((barber) => (
            <BarberItem key={barber.id} subdomain={subdomain} barber={barber} onResult={setNotice} />
          ))}
        </ul>
      )}
    </div>
  );
}
