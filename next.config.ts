import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En desarrollo, permite que los subdominios locales (labarberia.localhost:3000)
  // carguen los recursos del servidor de desarrollo.
  allowedDevOrigins: ["*.localhost"],
};

export default nextConfig;
