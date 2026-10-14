"use client";

import { useState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/forms/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { updateBarbershopInfo } from "@/lib/admin/actions";
import { ADDRESS_MAX, barbershopInfoSchema, DESCRIPTION_MAX } from "@/lib/admin/schemas";

/** "Mi barbería": nombre de solo lectura y los dos datos públicos opcionales. */
export function BarbershopForm({
  subdomain,
  name,
  description,
  address,
}: {
  subdomain: string;
  name: string;
  description: string | null;
  address: string | null;
}) {
  const { state, pending, onSubmit } = useAdminForm({
    action: updateBarbershopInfo,
    subdomain,
    schema: barbershopInfoSchema,
  });
  // Campos controlados: al guardar, revalidatePath cambia los valores iniciales y un campo no controlado
  // avisaría en consola de que cambió su defaultValue.
  const [text, setText] = useState(description ?? "");
  const [place, setPlace] = useState(address ?? "");

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      {/* Solo lectura: el nombre lo cambia el soporte de la plataforma (spec 006, FR-012). Como texto, no
          como campo, para que no parezca editable. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Nombre</p>
        <p className="text-base">{name}</p>
        <p className="text-sm text-muted-foreground">Para cambiarlo, escribe al soporte de la plataforma.</p>
      </div>

      <TextField
        label="Descripción"
        name="description"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        autoComplete="off"
        hint={`${text.length}/${DESCRIPTION_MAX}`}
        errors={state.fieldErrors?.description}
      />

      <TextField
        label="Dirección"
        name="address"
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        maxLength={ADDRESS_MAX}
        autoComplete="off"
        errors={state.fieldErrors?.address}
      />

      <p className="text-sm text-muted-foreground">
        Se muestran en la página pública de tu barbería. Déjalos vacíos para ocultarlos.
      </p>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="sm:self-start">
        Guardar
      </SubmitButton>
    </form>
  );
}
