// Subdominio sin barbería activa (no existe o está desactivada). Responde con estado 404.
// Un not-found de segmento no admite `metadata`: React 19 sube este <title> al <head>.
export default function BarbershopNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <title>Barbería no encontrada</title>
      <h1 className="text-2xl font-semibold">Barbería no encontrada</h1>
      <p className="text-muted-foreground">
        Revisa que la dirección esté bien escrita o pide a tu barbería su enlace de reservas.
      </p>
    </main>
  );
}
