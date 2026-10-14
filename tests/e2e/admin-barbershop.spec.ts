import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ownerDb } from "./helpers/db";

// "Mi barbería" del panel (spec 006, US3): el admin cambia la dirección, ve "Datos guardados." y la
// portada pública la muestra. Al terminar restaura el valor original del seed (db/seed.sql), que
// otros tests esperan. Solo corre contra la base local (ADR-014).

const BARBERSHOP = "11111111-1111-4111-8111-111111111111"; // labarberia (seed)
const ADMIN_EMAIL = "admin@labarberia.example.com";
const ADMIN_PASSWORD = "Demo-Barberia-2026";
const NEW_ADDRESS = "Carrera 7 # 70-10, Bogotá";

let original: { description: string | null; address: string | null };

test.beforeAll(async () => {
  const { rows } = await ownerDb.query("select description, address from public.barbershops where id = $1", [BARBERSHOP]);
  original = rows[0] as typeof original;
});

test.afterAll(async () => {
  await ownerDb.query("update public.barbershops set description = $2, address = $3 where id = $1", [
    BARBERSHOP,
    original.description,
    original.address,
  ]);
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("el admin guarda la dirección y la portada la muestra", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.waitForLoadState("networkidle"); // formulario hidratado antes de enviar
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible({ timeout: 20_000 });

  await page.goto("/admin/mi-barberia");
  await expect(page.getByRole("heading", { name: "Mi barbería" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expectNoAxeViolations(page);

  await page.getByLabel("Dirección").fill(NEW_ADDRESS);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Datos guardados.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(NEW_ADDRESS)).toBeVisible();
});
