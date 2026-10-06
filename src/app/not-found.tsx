import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página no encontrada",
};

// 404 general de la plataforma (rutas inexistentes y hosts no válidos).
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La página que buscas no existe.</p>
    </main>
  );
}
