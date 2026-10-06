import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { addDaysToLocalDate, localDateTimeToUtc, toLocalDate } from "../../src/lib/time";

// Agenda del admin (fase 6): ver la cita de un día, cancelarla y volver a verla cancelada.
// Usa el admin de demostración del seed local (supabase/seed.sql; la contraseña solo existe en
// local, ADR-014) y borra la cita que crea. Solo corre contra Supabase local.
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local"); // ADR-014
}
if (!secretKey) throw new Error("Falta SUPABASE_SECRET_KEY en .env.local");

const db = createClient<Database>(url, secretKey, { auth: { persistSession: false } });

const TZ = "America/Bogota";
const BARBERSHOP = "11111111-1111-4111-8111-111111111111"; // labarberia (seed)
const BARBER = "11111111-0000-4000-8000-0000000000b1";
const SERVICE = "11111111-0000-4000-8000-0000000000c1"; // 30 min
const ADMIN_EMAIL = "admin@labarberia.example.com";
const ADMIN_PASSWORD = "Demo-Barberia-2026";

const customerEmail = `e2e-agenda-${randomUUID().slice(0, 8)}@example.com`;
const customerName = "Cliente Agenda E2E";
// Dentro de dos días, a las 10:00 locales: futuro (se puede cancelar) y lejos del seed (13 de oct).
const day = addDaysToLocalDate(toLocalDate(new Date(), TZ), 2);

test.beforeAll(async () => {
  const startsAt = localDateTimeToUtc(`${day}T10:00`, TZ);
  const { error } = await db.from("appointments").insert({
    barbershop_id: BARBERSHOP,
    barber_id: BARBER,
    service_id: SERVICE,
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
    service_duration_minutes: 30,
    service_price: 25000,
    customer_name: customerName,
    customer_phone: `+573${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    customer_email: customerEmail,
    data_consent_at: new Date().toISOString(),
  });
  if (error) throw error;
});

test.afterAll(async () => {
  const { error } = await db.from("appointments").delete().eq("barbershop_id", BARBERSHOP).eq("customer_email", customerEmail);
  if (error) throw error;
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.waitForLoadState("networkidle"); // formulario hidratado antes de enviar
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
}

for (const [label, viewport] of [
  ["móvil", { width: 375, height: 812 }],
  ["escritorio", { width: 1280, height: 800 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    // Una sola ejecución cancela la cita; la segunda vuelta solo comprueba que se ve cancelada.
    test(`el admin ve la cita del día y la cancela (${label})`, async ({ page }) => {
      await login(page);

      await page.goto(`/admin?dia=${day}`);
      // La página pinta tabla (md+) y tarjetas (móvil) a la vez; solo una es visible.
      const visible = (text: string | RegExp) => page.getByText(text).locator("visible=true").first();
      await expect(visible(customerName)).toBeVisible();
      await expect(visible("10:00 a. m.–10:30 a. m.")).toBeVisible();
      await expectNoAxeViolations(page);

      const cancel = page.getByRole("button", { name: /Cancelar la cita de Cliente Agenda E2E/ }).locator("visible=true");
      if (await cancel.count()) {
        await cancel.first().click();
        await expectNoAxeViolations(page);
        await page.getByRole("button", { name: "Cancelar cita", exact: true }).click();
        await expect(page.getByText("Cita cancelada.")).toBeVisible();
        await expect(cancel).toHaveCount(0);
      }

      await expect(visible("Cancelada")).toBeVisible();
      await expectNoAxeViolations(page);

      const { data } = await db.from("appointments").select("status").eq("customer_email", customerEmail).single();
      expect(data?.status).toBe("cancelled");
    });
  });
}

test("un parámetro de día inválido muestra la agenda de hoy sin error", async ({ page }) => {
  await login(page);
  await page.goto("/admin?dia=basura&barbero=no-es-uuid");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText(/error/i)).toHaveCount(0);
});
