import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { insert, ownerDb, query } from "./helpers/db";
import { addDaysToLocalDate, localDateTimeToUtc, toLocalDate } from "../../src/lib/time";

// Agenda del admin (fase 6): ver la cita de un día, cancelarla y volver a verla cancelada.
// Usa el admin de demostración del seed local (db/seed.sql; la contraseña solo existe en
// local, ADR-014) y borra la cita que crea. Solo corre contra la base local.

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
  await insert("appointments", {
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
});

test.afterAll(async () => {
  await ownerDb.query("delete from public.appointments where barbershop_id = $1 and customer_email = $2", [BARBERSHOP, customerEmail]);
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
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible({ timeout: 20_000 }); // la primera compilación de /admin en desarrollo es lenta
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

      const [row] = await query<{ status: string }>("select status from public.appointments where customer_email = $1", [customerEmail]);
      expect(row?.status).toBe("cancelled");
    });
  });
}

test("un parámetro de día inválido muestra la agenda de hoy sin error", async ({ page }) => {
  await login(page);
  await page.goto("/admin?dia=basura&barbero=no-es-uuid");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText(/error/i)).toHaveCount(0);
});

test("el admin de otra barbería no entra al panel de esta", async ({ page }) => {
  await page.goto("http://elcorte.localhost:3000/admin/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.waitForLoadState("networkidle"); // formulario hidratado antes de enviar
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Esta cuenta no tiene acceso al panel de esta barbería.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agenda" })).toHaveCount(0);
});
