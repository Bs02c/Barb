import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";

// Datos de una barbería que se pueden mostrar en su página pública.
export type PublicBarbershop = {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
};

/**
 * Barbería activa con ese subdominio, o null si no existe o está desactivada.
 * `cache` evita repetir la consulta entre generateMetadata y la página en la misma petición.
 */
export const getPublicBarbershop = cache(
  async (subdomain: string): Promise<PublicBarbershop | null> => {
    const { data, error } = await createServiceClient()
      .from("barbershops")
      .select("id, name, subdomain, timezone")
      .eq("subdomain", subdomain)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
);
