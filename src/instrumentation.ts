// Se ejecuta una vez al arrancar el servidor de Next.js, antes de atender peticiones.
// Comprueba que la app no se conecta a la base con un rol capaz de saltarse RLS (spec 005, FR-014).
// La importación va dentro del `if` de NEXT_RUNTIME (patrón de la documentación de Next.js) para que
// el bundle de edge no arrastre `pg`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkRolesOrExit } = await import("./instrumentation-node");
    await checkRolesOrExit();
  }
}
