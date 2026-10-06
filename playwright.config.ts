import { defineConfig, devices } from "@playwright/test";

// Tests E2E y de accesibilidad (ADR-012). Corren contra la app local y Supabase local
// (npm run db:start); el subdominio de la barbería de demostración se resuelve con *.localhost.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://labarberia.localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
