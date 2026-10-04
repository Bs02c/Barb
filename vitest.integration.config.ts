import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Tests que necesitan Supabase local en marcha (npm run db:start).
// Leen las claves de .env.local, que apunta siempre a la base local (ADR-014).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv("", process.cwd(), ""),
  },
});
