import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En desarrollo, permite que los subdominios locales (labarberia.localhost:3000)
  // carguen los recursos del servidor de desarrollo.
  allowedDevOrigins: ["*.localhost"],
  // El token de cancelación va en la URL: sin Referer hacia otros sitios y sin caché intermedia
  // (spec 003, FR-010; revisión fase 5, SEC-002). Aplicar lo mismo en Caddy al migrar al VPS.
  async headers() {
    return [
      {
        source: "/cancelar/:token", // ruta original: el proxy la reescribe después a /s/<sub>/cancelar/...
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
