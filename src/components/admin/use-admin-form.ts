"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import type { z } from "zod";
import { initialState, type ActionState } from "@/lib/admin/action-state";

/** Firma común de las server actions del panel (src/lib/admin/actions.ts). */
export type AdminAction = (subdomain: string, prev: ActionState, formData: FormData) => Promise<ActionState>;

type Options = {
  action: AdminAction;
  subdomain: string;
  /** Esquema Zod compartido (src/lib/admin/schemas.ts): valida antes de llamar al servidor. */
  schema?: z.ZodType;
  /** Vacía el formulario tras guardar con éxito (formularios de "Añadir"). */
  resetOnSuccess?: boolean;
  /** Se llama con el resultado de cada envío (p. ej. para mostrarlo fuera del formulario). */
  onResult?: (result: ActionState) => void;
};

// Mismo formato que devuelve el servidor: { fieldErrors: { campo: [mensajes] } }.
function clientErrors(schema: z.ZodType, formData: FormData): ActionState | null {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return null;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, message: "Revisa los campos marcados.", fieldErrors };
}

/**
 * Conecta un formulario con una server action del panel.
 * Se envía con onSubmit (no con `action`) para que React no vacíe los campos cuando hay
 * errores: así el admin corrige sin volver a escribir todo.
 */
export function useAdminForm({ action, subdomain, schema, resetOnSuccess = false, onResult }: Options) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = (schema && clientErrors(schema, formData)) || (await action(subdomain, prev, formData));
    if (result.ok && resetOnSuccess) formRef.current?.reset();
    onResult?.(result);
    return result;
  }, initialState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, formRef, onSubmit };
}
