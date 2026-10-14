import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Portada de la barbería (spec 006, US1). Usa los datos del seed local: "La Barbería" con descripción,
// dirección y tres servicios con descripción; "El Corte" sin descripción ni dirección.

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("la portada de La Barbería muestra descripción, dirección, servicios y horario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "La Barbería" })).toBeVisible();
  await expect(page.getByText("Cortes clásicos y barba con navaja, sin afanes.").first()).toBeVisible();
  await expect(page.getByText("Calle 45 # 12-30, Bogotá")).toBeVisible();
  const map = page.getByRole("link", { name: /Ver mapa/ });
  await expect(map).toHaveAttribute("target", "_blank");
  await expect(map).toHaveAttribute("rel", /noopener/);

  const services = page.getByRole("region", { name: "Servicios" }).getByRole("listitem");
  await expect(services).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Corte clásico", exact: true })).toBeVisible();
  for (const card of await services.all()) {
    await expect(card.locator("p")).toHaveCount(1); // la descripción
  }

  const hours = page.getByRole("region", { name: "Horario" }).getByRole("listitem");
  await expect(hours).toHaveCount(7);
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
  await expect(page.locator('[aria-current="date"]')).toContainText("(hoy)");
});

test("«Reservar Corte clásico» lleva al paso 2 con ese servicio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Reservar Corte clásico" }).click();
  await expect(page.getByText("Paso 2 de 4")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tu selección" })).toContainText("Corte clásico");
});

test("la portada de El Corte no muestra descripción ni dirección", async ({ page }) => {
  await page.goto("http://elcorte.localhost:3000/");
  await expect(page.getByRole("heading", { level: 1, name: "El Corte" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver mapa/ })).toHaveCount(0);
  await expect(page.locator("header p")).toHaveCount(2); // etiqueta y estado de apertura
});

for (const [label, viewport] of [
  ["móvil", { width: 375, height: 812 }],
  ["escritorio", { width: 1280, height: 800 }],
] as const) {
  test(`la portada no tiene violaciones de accesibilidad (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
  });
}
