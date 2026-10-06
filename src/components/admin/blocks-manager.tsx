"use client";

import { useState } from "react";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/admin/fields";
import { BarberSelectOptions, type BarberOption } from "@/components/admin/schedule-manager";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";
import { addBlock, deleteBlock } from "@/lib/admin/actions";
import { blockSchema } from "@/lib/admin/schemas";

/** Bloqueo listo para mostrar: fechas ya formateadas en la hora local de la barbería. */
export type BlockRow = {
  id: string;
  barberName: string;
  startsLabel: string;
  endsLabel: string;
  reason: string | null;
};

export function AddBlockForm({
  subdomain,
  barbers,
  timezone,
}: {
  subdomain: string;
  barbers: BarberOption[];
  timezone: string;
}) {
  const { state, pending, formRef, onSubmit } = useAdminForm({
    action: addBlock,
    subdomain,
    schema: blockSchema,
    resetOnSuccess: true,
  });
  const errors = state.fieldErrors;
  const hint = `Hora local de la barbería (${timezone}).`;

  return (
    <form method="post" ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Barbero" name="barber_id" required errors={errors?.barber_id} className="sm:col-span-2">
          <BarberSelectOptions barbers={barbers} />
        </SelectField>
        <TextField
          label="Inicio"
          name="starts_at"
          type="datetime-local"
          required
          hint={hint}
          errors={errors?.starts_at}
        />
        <TextField label="Fin" name="ends_at" type="datetime-local" required hint={hint} errors={errors?.ends_at} />
        <TextField
          label="Motivo (opcional)"
          name="reason"
          maxLength={200}
          autoComplete="off"
          placeholder="Ej.: vacaciones, almuerzo"
          errors={errors?.reason}
          className="sm:col-span-2"
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="sm:self-start">
        Añadir bloqueo
      </SubmitButton>
    </form>
  );
}

export function BlockList({ subdomain, blocks }: { subdomain: string; blocks: BlockRow[] }) {
  const [notice, setNotice] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={notice} />
      {blocks.length === 0 ? (
        <p className="text-muted-foreground">No hay bloqueos próximos. Añade uno para descansos o vacaciones.</p>
      ) : (
        <ul className="divide-y">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col">
                <span className="text-base font-medium">{block.barberName}</span>
                <span className="text-sm">
                  {block.startsLabel} – {block.endsLabel}
                </span>
                {block.reason && <span className="text-sm text-muted-foreground">{block.reason}</span>}
              </div>
              <ConfirmDelete
                subdomain={subdomain}
                action={deleteBlock}
                id={block.id}
                title="¿Eliminar este bloqueo?"
                description={`${block.barberName}, del ${block.startsLabel} al ${block.endsLabel}. Ese tiempo dejará de estar bloqueado.`}
                triggerLabel={`Eliminar bloqueo de ${block.barberName}, ${block.startsLabel}`}
                onResult={setNotice}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
