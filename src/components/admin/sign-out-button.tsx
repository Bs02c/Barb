"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

function SignOutSubmit({ variant, className }: { variant: "default" | "outline" | "ghost"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      <LogOut aria-hidden="true" />
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  );
}

/** Cierra la sesión y vuelve al login (server action signOut). */
export function SignOutButton({
  variant = "outline",
  className,
}: {
  variant?: "default" | "outline" | "ghost";
  className?: string;
}) {
  return (
    <form action={signOut} className={cn(className)}>
      <SignOutSubmit variant={variant} className="w-full" />
    </form>
  );
}
