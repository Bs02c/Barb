"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/fields";
import { useAdminForm, type AdminAction } from "@/components/admin/use-admin-form";
import type { ActionState } from "@/lib/admin/action-state";

type Props = {
  subdomain: string;
  action: AdminAction;
  id: string;
  /** Pregunta del diálogo, p. ej. "¿Eliminar a Carlos?". */
  title: string;
  description: string;
  /** Texto accesible del botón que abre el diálogo, p. ej. "Eliminar a Carlos". */
  triggerLabel: string;
  /** Muestra solo el icono (con triggerLabel como nombre accesible). */
  iconOnly?: boolean;
  onResult: (result: ActionState) => void;
};

/** Acción destructiva con confirmación (DESIGN.md). El resultado se muestra fuera del diálogo. */
export function ConfirmDelete({ subdomain, action, id, title, description, triggerLabel, iconOnly, onResult }: Props) {
  const [open, setOpen] = useState(false);
  const { pending, onSubmit } = useAdminForm({
    action,
    subdomain,
    onResult: (result) => {
      setOpen(false);
      onResult(result);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size={iconOnly ? "icon" : "default"}
            className="text-destructive hover:text-destructive"
            aria-label={triggerLabel}
          />
        }
      >
        <Trash2 aria-hidden="true" />
        {!iconOnly && "Eliminar"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form method="post" onSubmit={onSubmit} className="contents">
          <input type="hidden" name="id" value={id} />
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <SubmitButton variant="destructive" pending={pending} pendingLabel="Eliminando…">
              Eliminar
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
