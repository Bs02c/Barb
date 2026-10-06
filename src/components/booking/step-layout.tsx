import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Piezas de presentación del flujo de reserva (DESIGN.md, "Reserva por pasos").
// Son componentes de servidor: elegir una opción es seguir un enlace que añade un parámetro a la URL.

export const TOTAL_STEPS = 4;

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * "Paso 2 de 4" en texto + barra de progreso en cobre; enlace "Atrás" si hay paso anterior.
 * `total` baja a 3 cuando "Lo más pronto" se salta el calendario.
 */
export function StepHeader({
  step,
  title,
  backHref,
  total = TOTAL_STEPS,
}: {
  step: number;
  title: string;
  backHref?: string;
  total?: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {backHref && (
        <Link
          href={backHref}
          className={cn(
            "-ml-2 inline-flex h-11 w-fit items-center gap-1 rounded-lg px-2 text-base font-medium hover:bg-muted",
            focusRing,
          )}
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
          Atrás
        </Link>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Paso {step} de {total}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-selection" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
    </div>
  );
}

export type SummaryItem = { label: string; value: string };

/** Resumen de lo elegido, siempre visible arriba del paso. */
export function BookingSummary({ items }: { items: SummaryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Tu selección" className="rounded-lg border bg-card p-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Tarjeta de servicio o barbero: un enlace al siguiente paso. */
export function ChoiceCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: "clock";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted",
        focusRing,
      )}
    >
      {icon === "clock" && (
        <Clock className="size-5 shrink-0 text-selection" strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="flex flex-1 flex-col">
        <span className="font-medium">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** Chip de día u hora (44 px de alto, radio completo). Seleccionado: fondo cobre. */
export function Chip({ href, selected = false, children }: { href: string; selected?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      scroll={false}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full border px-4 text-base font-medium whitespace-nowrap transition-colors",
        focusRing,
        selected
          ? "border-selection bg-selection text-selection-foreground"
          : "border-input bg-card hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

/** Mensaje de vacío: qué pasó y qué hacer. */
export function EmptyState({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p>{message}</p>
      {action && (
        <Link
          href={action.href}
          className={cn("w-fit rounded-sm font-medium text-selection underline underline-offset-4", focusRing)}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
