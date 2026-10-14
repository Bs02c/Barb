"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { CalendarDays, CalendarOff, Clock, Scissors, Store, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Rutas visibles para el usuario (labarberia.dominio/admin/...); el proxy las reescribe.
const ITEMS: { segment: string | null; href: string; label: string; icon: LucideIcon }[] = [
  { segment: null, href: "/admin", label: "Agenda", icon: CalendarDays },
  { segment: "barberos", href: "/admin/barberos", label: "Barberos", icon: Users },
  { segment: "servicios", href: "/admin/servicios", label: "Servicios", icon: Scissors },
  { segment: "horarios", href: "/admin/horarios", label: "Horarios", icon: Clock },
  { segment: "bloqueos", href: "/admin/bloqueos", label: "Bloqueos", icon: CalendarOff },
  { segment: "mi-barberia", href: "/admin/mi-barberia", label: "Mi barbería", icon: Store },
];

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Navegación lateral (escritorio, md en adelante). */
export function SidebarNav() {
  const active = useSelectedLayoutSegment();
  return (
    <nav aria-label="Panel" className="flex flex-col gap-1">
      {ITEMS.map(({ segment, href, label, icon: Icon }) => {
        const current = segment === active;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
              focusRing,
              current ? "bg-selection text-selection-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior (móvil): una columna por sección. "Cerrar sesión" va en la cabecera móvil del layout. */
export function BottomNav() {
  const active = useSelectedLayoutSegment();
  return (
    <nav
      aria-label="Panel"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${ITEMS.length}, minmax(0, 1fr))` }}>
        {ITEMS.map(({ segment, href, label, icon: Icon }) => {
          const current = segment === active;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors",
                  focusRing,
                  current ? "text-link" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={current ? 2.25 : 1.75} aria-hidden="true" />
                <span className={cn(current && "underline underline-offset-4")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
