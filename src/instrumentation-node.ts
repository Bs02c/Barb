import { assertSafeRoles } from "@/lib/db/startup-check";

/** Sale del proceso si el rol de la base no es seguro (solo runtime de Node; ver instrumentation.ts). */
export async function checkRolesOrExit(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return; // `next build` no tiene base
  try {
    await assertSafeRoles();
  } catch (error) {
    // Solo el motivo: nunca la URL de conexión ni contraseñas.
    const reason =
      error instanceof Error && !("code" in error)
        ? error.message
        : `no se pudo comprobar (${(error as { code?: string })?.code ?? "error desconocido"})`;
    console.error(`La app no arranca: el rol de la base no es seguro. ${reason}`);
    process.exit(1);
  }
}
