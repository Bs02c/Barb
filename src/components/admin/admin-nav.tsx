"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CalendarOff, Clock, House, LogOut, Scissors, Users, type LucideIcon } from "lucide-react";
import { signOut } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

// Rutas visibles para el usuario (labarberia.dominio/admin/...); el proxy las reescribe.
const ITEMS: { segment: string | null; href: string; label: string; icon: LucideIcon }[] = [
  { segment: null, href: "/admin", label: "Inicio", icon: House },
  { segment: "barberos", href: "/admin/barberos", label: "Barberos", icon: Users },
  { segment: "servicios", href: "/admin/servicios", label: "Servicios", icon: Scissors },
  { segment: "horarios", href: "/admin/horarios", label: "Horarios", icon: Clock },
  { segment: "bloqueos", href: "/admin/bloqueos", label: "Bloqueos", icon: CalendarOff },
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

function BottomSignOut() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium text-foreground disabled:opacity-50",
        focusRing,
      )}
    >
      <LogOut className="size-5" strokeWidth={1.75} aria-hidden="true" />
      {pending ? "Saliendo…" : "Salir"}
    </button>
  );
}

/** Barra inferior (móvil). */
export function BottomNav() {
  const active = useSelectedLayoutSegment();
  return (
    <nav
      aria-label="Panel"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-6">
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
                  current ? "text-selection" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={current ? 2.25 : 1.75} aria-hidden="true" />
                <span className={cn(current && "underline underline-offset-4")}>{label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <form action={signOut} className="h-full">
            <BottomSignOut />
          </form>
        </li>
      </ul>
    </nav>
  );
}
