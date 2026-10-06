import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { BottomNav, SidebarNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { getAdminContext } from "@/lib/admin/session";

// Guarda de acceso del panel. Cada página la repite (getAdminContext está en caché por
// petición), porque al navegar entre secciones el layout no se vuelve a renderizar.
export default async function PanelLayout({ children, params }: LayoutProps<"/s/[subdomain]/admin">) {
  const { subdomain } = await params;
  const context = await getAdminContext(subdomain);

  if (context.status === "anonymous") redirect("/admin/login");

  if (context.status !== "ok") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-8 text-destructive" strokeWidth={1.75} aria-hidden="true" />
          <h1 className="text-xl font-semibold">Sin acceso al panel</h1>
          <p className="text-muted-foreground">
            {context.status === "inactive"
              ? "Esta barbería está desactivada. Contacta con el soporte de la plataforma."
              : "Esta cuenta no tiene acceso al panel de esta barbería. Cierra sesión y entra con la cuenta de administración de la barbería."}
          </p>
          <SignOutButton variant="default" />
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card p-4 md:flex">
        <p className="px-3 pt-2 text-lg font-semibold">{context.barbershop.name}</p>
        <SidebarNav />
        <SignOutButton variant="ghost" className="mt-auto" />
      </aside>
      <header className="border-b bg-card px-4 py-3 md:hidden">
        <p className="text-lg font-semibold">{context.barbershop.name}</p>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      <BottomNav />
    </div>
  );
}
