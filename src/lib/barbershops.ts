import "server-only";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { withService } from "@/lib/db/client";
import { barbershops } from "@/lib/db/schema";

// Datos de una barbería que se pueden mostrar en su página pública.
export type PublicBarbershop = {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
};

/**
 * Barbería activa con ese subdominio, o null si no existe o está desactivada.
 * Con service_role (web pública, sin sesión). `cache` evita repetir la consulta entre
 * generateMetadata y la página en la misma petición.
 */
export const getPublicBarbershop = cache(
  async (subdomain: string): Promise<PublicBarbershop | null> => {
    const [row] = await withService((tx) =>
      tx
        .select({ id: barbershops.id, name: barbershops.name, subdomain: barbershops.subdomain, timezone: barbershops.timezone })
        .from(barbershops)
        .where(and(eq(barbershops.subdomain, subdomain), eq(barbershops.isActive, true)))
        .limit(1),
    );
    return row ?? null;
  },
);
