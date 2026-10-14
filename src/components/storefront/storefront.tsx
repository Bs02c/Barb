import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CatalogService } from "@/lib/booking/queries";
import type { DayHours, OpeningStatus } from "@/lib/storefront/hours";
import { mapsSearchUrl } from "@/lib/storefront/hours";
import { formatDuration } from "@/lib/time";

// Piezas de la portada pública (spec 006; DESIGN.md "Portada de la barbería" y "Tarjeta de servicio").
// Server Components: no hay interacción, solo enlaces.

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Bloque superior: textura de franjas, etiqueta, nombre, descripción, estado y dirección. */
export function StorefrontHero({
  name,
  description,
  address,
  status,
}: {
  name: string;
  description: string | null;
  address: string | null;
  status: OpeningStatus;
}) {
  return (
    <header className="relative overflow-hidden rounded-xl border bg-card px-5 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "repeating-linear-gradient(-45deg, var(--link) 0 10px, transparent 10px 28px)",
        }}
      />
      <div className="relative flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-link uppercase">Barbería</p>
        <h1 className="font-display text-4xl font-bold">{name}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
        <p className={cn("font-medium", status.kind === "open" ? "text-success" : "text-muted-foreground")}>
          {status.text}
        </p>
        {address && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MapPin className="size-5 shrink-0 text-link" strokeWidth={1.75} aria-hidden="true" />
            <span>{address}</span>
            <a
              href={mapsSearchUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("rounded-sm font-medium text-link underline underline-offset-4", focusRing)}
            >
              Ver mapa<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * Tarjeta de servicio: nombre y precio, descripción (2 líneas), duración y botón "Reservar".
 * Sin horarios (`bookable` falso) no hay botón: llevaría a una reserva sin horas.
 */
export function ServiceCard({ service, bookable }: { service: CatalogService; bookable: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium">{service.name}</h3>
        <span className="font-bold tabular-nums">{service.priceLabel}</span>
      </div>
      {service.description && <p className="line-clamp-2 text-sm text-muted-foreground">{service.description}</p>}
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {formatDuration(service.durationMinutes)}
        </span>
        {bookable && (
          <Link
            href={`/reservar?servicio=${service.id}`}
            aria-label={`Reservar ${service.name}`}
            className={buttonVariants({ className: "h-11 px-5" })}
          >
            Reservar
          </Link>
        )}
      </div>
    </li>
  );
}

/** Horario semanal: siete filas; la de hoy lleva aria-current="date" y "(hoy)" además del color. */
export function HoursList({ hours, today }: { hours: DayHours[]; today: number }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {hours.map((day) => {
        const isToday = day.weekday === today;
        return (
          <li
            key={day.weekday}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "flex items-center justify-between gap-3 border-l-4 border-l-transparent px-4 py-3",
              isToday && "border-l-selection bg-muted font-medium",
            )}
          >
            <span>
              {day.label}
              {isToday && " (hoy)"}
            </span>
            <span className={cn("tabular-nums", !day.openLabel && "text-muted-foreground")}>
              {day.openLabel && day.closeLabel ? `${day.openLabel} – ${day.closeLabel}` : "Cerrado"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
