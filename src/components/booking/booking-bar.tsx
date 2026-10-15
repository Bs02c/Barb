import type { ReactNode } from "react";

// Barra fija inferior de la reserva (spec 007; DESIGN.md "Barra de la reserva"): resumen de la cita
// y la acción del paso ("Continuar" o "Confirmar reserva"). Reserva su propio espacio al final de la
// página para no tapar contenido, y respeta el área segura de los celulares.

export function BookingBar({
  title,
  price,
  detail,
  children,
}: {
  /** Servicio. */
  title: string;
  /** "$ 25.000": junto al servicio, sin recortarse. */
  price: string;
  /** "10:00 a. m. – 10:30 a. m.". */
  detail: string;
  /** Botón o enlace de la acción principal. */
  children: ReactNode;
}) {
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
          <div role="status" aria-live="polite" className="min-w-0 flex-1">
            <p className="flex min-w-0 gap-2 font-medium">
              <span className="truncate">{title}</span>
              <span className="shrink-0 tabular-nums">· {price}</span>
            </p>
            <p className="truncate text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="shrink-0">{children}</div>
        </div>
      </div>
    </>
  );
}
