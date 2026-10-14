import type { Metadata } from "next";
import { BarbershopForm } from "@/components/admin/barbershop-form";
import { getBarbershopInfo } from "@/lib/admin/queries";
import { getPanelContext } from "../_lib/panel-context";

export const metadata: Metadata = { title: "Mi barbería" };

export default async function MyBarbershopPage(props: PageProps<"/s/[subdomain]/admin/mi-barberia">) {
  const { subdomain } = await props.params;
  const context = await getPanelContext(subdomain);
  if (!context) return null;

  const info = await getBarbershopInfo(context.barbershop);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Mi barbería</h1>
      <BarbershopForm
        subdomain={subdomain}
        name={context.barbershop.name}
        description={info.description}
        address={info.address}
      />
    </div>
  );
}
