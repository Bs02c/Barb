"use client";

import { FormMessage, SubmitButton, TextField } from "@/components/forms/fields";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { confirmPanelAccess } from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/action-state";
import { loginSchema } from "@/lib/admin/schemas";

const fail = (message: string): ActionState => ({ ok: false, message });

// Paso 1: credenciales contra Better Auth (mismo origen). Paso 2: el servidor confirma
// que la cuenta es admin de esta barbería y redirige a /admin; si no, devuelve el mensaje.
async function signIn(subdomain: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let response: Response;
  try {
    response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),
      credentials: "same-origin",
    });
  } catch {
    return fail("No se pudo iniciar sesión. Inténtalo de nuevo.");
  }
  if (response.status === 401 || response.status === 400) return fail("Correo o contraseña incorrectos.");
  if (response.status === 429) return fail("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
  if (!response.ok) return fail("No se pudo iniciar sesión. Inténtalo de nuevo.");
  return confirmPanelAccess(subdomain);
}

export function LoginForm({ subdomain }: { subdomain: string }) {
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
