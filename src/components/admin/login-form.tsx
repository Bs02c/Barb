"use client";

import { FormMessage, SubmitButton, TextField } from "@/components/forms/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { signIn } from "@/lib/admin/actions";
import { loginSchema } from "@/lib/admin/schemas";

export function LoginForm({ subdomain }: { subdomain: string }) {
  // Si entra, signIn redirige a /admin; si no, devuelve el mensaje de error.
  const { state, pending, onSubmit } = useAdminForm({ action: signIn, subdomain, schema: loginSchema });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <TextField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <FormMessage state={state.ok ? null : state} />
      <SubmitButton pending={pending} pendingLabel="Entrando…" className="w-full">
        Entrar
      </SubmitButton>
    </form>
  );
}
