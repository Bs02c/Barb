import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Paso 3 de la reserva: carrusel de fechas y franjas Mañana / Tarde / Noche (DESIGN.md, "Paso 3").
// Seed de labarberia: horario de lunes a sábado 9:00-19:00, así que los domingos salen sin horas.

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function openStep3(page: Page) {
  await page.goto("/reservar");
  await page.getByRole("main").getByRole("listitem").first().getByRole("link").click();
  await page.getByRole("link", { name: /Lo más pronto/ }).click();
  await page.getByRole("link", { name: "Prefiero elegir otra hora" }).click();
  await expect(page.getByRole("navigation", { name: "Fechas" })).toBeVisible();
}

test("el carrusel tiene 30 fechas y sin fecha elegida pide elegir una", async ({ page }) => {
  await openStep3(page);
  await expect(page.getByRole("navigation", { name: "Fechas" }).getByRole("listitem")).toHaveCount(30);
  await expect(page.getByText("Elige una fecha")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Franja del día" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("una fecha sin horas no es un enlace", async ({ page }) => {
  await openStep3(page);
  const disabled = page.getByRole("navigation", { name: "Fechas" }).locator('[aria-disabled="true"]');
  expect(await disabled.count()).toBeGreaterThan(0); // los domingos
  await expect(disabled.first().locator("xpath=ancestor-or-self::a")).toHaveCount(0);
  await expect(disabled.first()).toContainText(/sin horas/);
});

test("elegir una fecha abre la primera franja con horas y cambiar de franja cambia las horas", async ({ page }) => {
  await openStep3(page);
  const dates = page.getByRole("navigation", { name: "Fechas" }).getByRole("link");
  // Una fecha con horas posterior a hoy: el seed siempre tiene días con horas en 30 días.
  await dates.nth(1).click();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);

  const periods = page.getByRole("navigation", { name: "Franja del día" });
  await expect(periods.getByRole("listitem")).toHaveCount(3);
  const open = periods.locator('[aria-current="true"]');
  await expect(open).toContainText("Mañana");

  const hours = page.getByRole("region", { name: /Horas de la/ }).getByRole("link");
  const morning = await hours.allInnerTexts();
  expect(morning.length).toBeGreaterThan(0);

  await periods.getByRole("link", { name: /Tarde/ }).click();
  await expect(periods.locator('[aria-current="true"]')).toContainText("Tarde");
  await expect.poll(async () => hours.allInnerTexts()).not.toEqual(morning);
  await expectNoAxeViolations(page);

  // Volver desde el paso 4 regresa a la misma franja.
  await hours.first().click();
  await expect(page.getByText("Paso 4 de 4")).toBeVisible();
  await page.getByRole("link", { name: "Atrás" }).click();
  await expect(periods.locator('[aria-current="true"]')).toContainText("Tarde");
});

test("una franja sin horas no es un enlace", async ({ page }) => {
  await openStep3(page);
  // La primera fecha con horas puede ser hoy: pasado el mediodía, "Mañana" ya no tiene horas. Si no
  // hay ninguna franja vacía (seed completo de 9:00 a 19:00) no hay nada que comprobar.
  await page.getByRole("navigation", { name: "Fechas" }).getByRole("link").first().click();
  const periods = page.getByRole("navigation", { name: "Franja del día" });
  await expect(periods.getByRole("listitem")).toHaveCount(3);
  const empty = periods.locator('[aria-disabled="true"]');
  test.skip((await empty.count()) === 0, "hoy todas las franjas tienen horas");
  await expect(empty.first().locator("xpath=ancestor-or-self::a")).toHaveCount(0);
  await expect(empty.first()).toContainText("Sin horas");
});
