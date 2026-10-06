import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getAdminContext } from "@/lib/admin/session";
import { getPublicBarbershop } from "@/lib/barbershops";

export const metadata: Metadata = {
  title: "Entrar al panel",
};

export default async function AdminLoginPage(props: PageProps<"/s/[subdomain]/admin/login">) {
  const { subdomain } = await props.params;
  const barbershop = await getPublicBarbershop(subdomain);
  if (!barbershop) notFound();

  const context = await getAdminContext(subdomain);
  if (context.status === "ok") redirect("/admin");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">{barbershop.name}</p>
        <h1 className="mt-1 mb-6 text-2xl font-semibold">Entrar al panel</h1>
        <LoginForm subdomain={subdomain} />
      </div>
    </main>
  );
}
