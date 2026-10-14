import Link from "next/link";
import { cn } from "@/lib/utils";

// Tarjetas Mañana / Tarde / Noche del paso 3 (DESIGN.md, "Paso 3"). Componente de servidor.

export type PeriodCard = { id: string; label: string; count: number; href: string };

const base = "flex min-h-16 flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center";

export function PeriodPicker({ periods, selected }: { periods: PeriodCard[]; selected?: string }) {
  return (
    <nav aria-label="Franja del día">
      <ul className="grid grid-cols-3 gap-2">
        {periods.map((p) => {
          const text = p.count === 0 ? "Sin horas" : p.count === 1 ? "1 hora" : `${p.count} horas`;
          const content = (
            <>
              <span className="font-medium">{p.label}</span>
              <span className={cn("text-sm", p.count === 0 ? "text-unavailable-foreground" : "text-muted-foreground")}>
                {text}
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {p.count === 0 ? (
                <span aria-disabled="true" className={cn(base, "border-transparent bg-unavailable text-unavailable-foreground")}>
                  {content}
                </span>
              ) : (
                <Link
                  href={p.href}
                  scroll={false}
                  aria-current={p.id === selected ? "true" : undefined}
                  className={cn(
                    base,
                    "transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    p.id === selected ? "border-selection bg-muted" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
