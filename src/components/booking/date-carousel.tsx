"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Carrusel de fechas del paso 3 (DESIGN.md, "Paso 3"). Cliente solo para centrar la fecha elegida al
// cargar; elegir una fecha sigue siendo seguir un enlace.

export type CarouselDay = {
  localDate: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
  available: boolean;
  /** Enlace para elegir esta fecha (solo se usa si hay horas). */
  href: string;
};

const card = "flex h-[4.5rem] w-14 shrink-0 snap-start flex-col items-center justify-center rounded-lg border-2";

export function DateCarousel({ days, selected }: { days: CarouselDay[]; selected?: string }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!list || !current) return;
    // Se mueve solo el carrusel (no la página) y sin animación: respeta prefers-reduced-motion.
    list.scrollTo({ left: current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2, behavior: "auto" });
  }, [selected]);

  return (
    <nav aria-label="Fechas">
      <ul ref={listRef} className="relative flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const top = d.isToday ? "Hoy" : d.weekday;
          const name = `${d.weekday} ${d.day} ${d.month}`;
          if (!d.available) {
            return (
              <li key={d.localDate} className="shrink-0">
                <span
                  aria-disabled="true"
                  className={cn(card, "border-transparent bg-unavailable text-unavailable-foreground")}
                >
                  <span aria-hidden="true" className="flex flex-col items-center leading-tight">
                    <span className="text-sm">{top}</span>
                    <span className="text-xl font-semibold line-through">{d.day}</span>
                    <span className="text-sm">{d.month}</span>
                  </span>
                  <span className="sr-only">{name}, sin horas</span>
                </span>
              </li>
            );
          }
          const isSelected = d.localDate === selected;
          return (
            <li key={d.localDate} className="shrink-0">
              <Link
                href={d.href}
                scroll={false}
                aria-label={d.isToday ? `Hoy, ${name}` : name}
                aria-current={isSelected ? "date" : undefined}
                className={cn(
                  card,
                  "transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isSelected ? "border-selection bg-muted" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="flex flex-col items-center leading-tight">
                  <span className="text-sm text-muted-foreground">{top}</span>
                  <span className="text-xl font-semibold">{d.day}</span>
                  <span className="text-sm text-muted-foreground">{d.month}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
