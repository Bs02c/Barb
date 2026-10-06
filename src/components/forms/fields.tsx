"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

// Piezas comunes de los formularios (panel y reserva pública): etiqueta visible, error por campo asociado con
// aria-describedby, mensaje general tras enviar y botón con estado de envío (DESIGN.md).

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{messages.join(" ")}</span>
    </p>
  );
}

type FieldProps = {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  className?: string;
};

function useFieldIds(name: string, errors?: string[], hint?: string) {
  const id = `${useId()}-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, errors?.length ? errorId : null].filter(Boolean).join(" ");
  return { id, errorId, hintId, describedBy: describedBy || undefined, invalid: errors?.length ? true : undefined };
}

export function TextField({
  label,
  name,
  errors,
  hint,
  className,
  ...inputProps
}: FieldProps & Omit<ComponentProps<"input">, "name" | "id" | "className">) {
  const ids = useFieldIds(name, errors, hint);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={ids.id}>{label}</Label>
      <Input
        id={ids.id}
        name={name}
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        {...inputProps}
      />
      {hint && (
        <p id={ids.hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={ids.errorId} messages={errors} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  className,
  children,
  ...selectProps
}: FieldProps & { children: ReactNode } & Omit<ComponentProps<"select">, "name" | "id" | "className" | "size">) {
  const ids = useFieldIds(name, errors, hint);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={ids.id}>{label}</Label>
      <NativeSelect
        id={ids.id}
        name={name}
        className="w-full"
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        {...selectProps}
      >
        {children}
      </NativeSelect>
      {hint && (
        <p id={ids.hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={ids.errorId} messages={errors} />
    </div>
  );
}

/** Resultado del último envío: éxito en verde o error en rojo, siempre con icono y texto. */
export function FormMessage({
  state,
  className,
}: {
  state: { ok: boolean; message?: string } | null;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {state?.message && (
        <p
          className={cn(
            "flex items-start gap-2 text-sm font-medium",
            state.ok ? "text-success" : "text-destructive",
          )}
        >
          {state.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}

/** Botón de envío: muestra "Guardando…" y se deshabilita mientras el servidor responde. */
export function SubmitButton({
  pending,
  pendingLabel = "Guardando…",
  children,
  ...props
}: { pending: boolean; pendingLabel?: string } & ComponentProps<typeof Button>) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
