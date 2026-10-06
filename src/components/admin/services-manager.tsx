"use client";

import { useState } from "react";
import { Pencil, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { FormMessage, SubmitButton, TextField } from "@/components/admin/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";
import { createService, deleteService, setServiceActive, updateService } from "@/lib/admin/actions";
import { serviceSchema } from "@/lib/admin/schemas";
import { cn } from "@/lib/utils";

/** Servicio listo para mostrar: el precio ya viene formateado desde el servidor (formatPrice). */
export type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  priceLabel: string;
  is_active: boolean;
};

type Errors = Record<string, string[]> | undefined;

function ServiceFields({ errors, service }: { errors: Errors; service?: ServiceRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
      <TextField
        label="Nombre"
        name="name"
        defaultValue={service?.name}
        autoComplete="off"
        required
        maxLength={100}
        errors={errors?.name}
      />
      <TextField
        label="Duración (minutos)"
        name="duration_minutes"
        type="number"
        inputMode="numeric"
        min={1}
        max={480}
        step={1}
        defaultValue={service?.duration_minutes}
        required
        errors={errors?.duration_minutes}
      />
      <TextField
        label="Precio (COP)"
        name="price"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        defaultValue={service?.price}
        required
        errors={errors?.price}
      />
    </div>
  );
}

export function AddServiceForm({ subdomain }: { subdomain: string }) {
  const { state, pending, formRef, onSubmit } = useAdminForm({
    action: createService,
    subdomain,
    schema: serviceSchema,
    resetOnSuccess: true,
  });

  return (
    <form method="post" ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ServiceFields errors={state.fieldErrors} />
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="sm:self-start">
        Añadir servicio
      </SubmitButton>
    </form>
  );
}

function ServiceItem({
  subdomain,
  service,
  onResult,
}: {
  subdomain: string;
  service: ServiceRow;
  onResult: (result: ActionState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const update = useAdminForm({
    action: updateService,
    subdomain,
    schema: serviceSchema,
    onResult: (result) => {
      if (result.ok) setEditing(false);
      onResult(result);
    },
  });
  const toggle = useAdminForm({ action: setServiceActive, subdomain, onResult });

  if (editing) {
    return (
      <li className="py-3">
        <form
          method="post"
          onSubmit={update.onSubmit}
          noValidate
          aria-label={`Editar ${service.name}`}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={service.id} />
          <ServiceFields errors={update.state.fieldErrors} service={service} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="secondary" pending={update.pending}>
              Guardar
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={update.pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-h-11 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className={cn("text-base font-medium", !service.is_active && "text-muted-foreground")}>
            {service.name}
          </span>
          {!service.is_active && <Badge variant="outline">Inactivo</Badge>}
        </div>
        <span className="text-sm text-muted-foreground">
          {service.duration_minutes} min · {service.priceLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing(true)} aria-label={`Editar ${service.name}`}>
          <Pencil aria-hidden="true" />
          Editar
        </Button>
        <form method="post" onSubmit={toggle.onSubmit}>
          <input type="hidden" name="id" value={service.id} />
          <input type="hidden" name="is_active" value={service.is_active ? "false" : "true"} />
          <SubmitButton
            variant="outline"
            pending={toggle.pending}
            aria-label={`${service.is_active ? "Desactivar" : "Activar"} ${service.name}`}
          >
            {service.is_active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {service.is_active ? "Desactivar" : "Activar"}
          </SubmitButton>
        </form>
        <ConfirmDelete
          subdomain={subdomain}
          action={deleteService}
          id={service.id}
          title={`¿Eliminar ${service.name}?`}
          description="Si ya tiene citas no se puede eliminar: desactívalo para que no se pueda reservar."
          triggerLabel={`Eliminar ${service.name}`}
          onResult={onResult}
        />
      </div>
    </li>
  );
}

export function ServiceList({ subdomain, services }: { subdomain: string; services: ServiceRow[] }) {
  const [notice, setNotice] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={notice} />
      {services.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay servicios. Añade el primero con su duración y precio.</p>
      ) : (
        <ul className="divide-y">
          {services.map((service) => (
            <ServiceItem key={service.id} subdomain={subdomain} service={service} onResult={setNotice} />
          ))}
        </ul>
      )}
    </div>
  );
}
