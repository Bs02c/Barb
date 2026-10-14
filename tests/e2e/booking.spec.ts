import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ownerDb } from "./helpers/db";

// Reserva pública completa en vista móvil, con escaneo de accesibilidad en cada paso
// (spec 002, FR-018 y SC-006). Usa la barbería de demostración del seed (labarberia) y
// borra la cita que crea. Solo corre contra la base local (ADR-014).

// Datos únicos por ejecución: el correo identifica la cita a borrar y el número evita el tope de 2 citas.
const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
const phone = `3${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

test.use({ viewport: { width: 375, height: 812 } });

test.afterAll(async () => {
  await ownerDb.query(
    "delete from public.appointments where customer_email = $1 and barbershop_id = (select id from public.barbershops where subdomain = 'labarberia')",
    [email],
  );
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("un cliente reserva una cita con «Lo más pronto» desde el celular", async ({ page }) => {
  // Página de la barbería.
  await page.goto("/");
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Reservar cita" }).click();

  // Paso 1: servicio.
  await expect(page.getByText("Paso 1 de 4")).toBeVisible();
  await expect(page).toHaveTitle(/Reservar cita/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expectNoAxeViolations(page);
  await page.getByRole("main").getByRole("listitem").first().getByRole("link").click();

  // Paso 2: barbero.
  await expect(page.getByText("Paso 2 de 4")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: /Lo más pronto/ }).click();

  // «Lo más pronto» salta el calendario: paso de datos con la primera hora libre (FR-004).
  // «Prefiero elegir otra hora» abre el calendario y «Atrás» vuelve al paso de datos.
  await expect(page.getByText("Paso 3 de 3")).toBeVisible();
  await expect(page.getByText(/La más pronta:/)).toBeVisible();
  await page.getByRole("link", { name: "Prefiero elegir otra hora" }).click();
  await expect(page.getByRole("navigation", { name: "Días disponibles" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.goBack();

  // Paso de datos. El resumen ya muestra el barbero asignado.
  await expect(page.getByText("Paso 3 de 3")).toBeVisible();
  const assignedBarber = await page
    .getByRole("region", { name: "Tu selección" })
    .locator("dt", { hasText: "Barbero" })
    .locator("+ dd")
    .innerText();
  expect(assignedBarber).not.toBe("Lo más pronto");
  await page.waitForLoadState("networkidle"); // formulario hidratado antes de enviar
  await expectNoAxeViolations(page);

  await page.getByLabel("Nombre").fill("Cliente E2E");
  await page.getByLabel("Número de contacto").fill(phone);
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("checkbox", { name: /Autorizo el tratamiento/ }).check();
  await page.getByRole("button", { name: "Reservar cita" }).click();

  // Confirmación.
  await expect(page.getByRole("heading", { name: "Cita confirmada" })).toBeVisible();
  await expect(page.getByText(assignedBarber, { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
});
