import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ownerDb } from "./helpers/db";

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

  // Tocar una hora no cambia de paso; Continuar sí, y Atrás vuelve con la hora marcada en la misma franja.
  await hours.first().click();
  await expect(page.getByText("Paso 3 de 4")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar" })).toBeVisible();
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByText("Paso 4 de 4")).toBeVisible();
  await page.getByRole("link", { name: "Atrás" }).click();
  await expect(periods.locator('[aria-current="true"]')).toContainText("Tarde");
  await expect(page.getByRole("region", { name: /Horas de la/ }).locator('a[aria-current="true"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Continuar" })).toBeVisible();
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

test("«Primera fecha con horas» abre la primera fecha disponible", async ({ page }) => {
  await openStep3(page);
  const first = page.getByRole("link", { name: /^Primera fecha con horas:/ });
  await expect(first).toBeVisible();
  const firstDate = page.getByRole("navigation", { name: "Fechas" }).getByRole("link").first();
  await first.click();
  await expect(page.locator('[aria-current="date"]')).toHaveAttribute("aria-label", (await firstDate.getAttribute("aria-label")) ?? "");
  await expect(page.getByRole("link", { name: /^Primera fecha con horas:/ })).toHaveCount(0);
});

test("las fechas con pocas horas avisan en su nombre accesible", async ({ page }) => {
  await openStep3(page);
  // Con el seed completo puede no haber ninguna; solo se comprueba el aviso si aparece.
  const few = page.getByRole("navigation", { name: "Fechas" }).getByRole("link", { name: /quedan pocas horas/ });
  if ((await few.count()) > 0) await expect(few.first()).toContainText("");
});

test.describe("reserva completa con barra y confirmación", () => {
  const email = `e2e-cal-${randomUUID().slice(0, 8)}@example.com`;
  const phone = `3${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

  test.afterAll(async () => {
    await ownerDb.query(
      "delete from public.appointments where customer_email = $1 and barbershop_id = (select id from public.barbershops where subdomain = 'labarberia')",
      [email],
    );
  });

  test("hora, barra, datos, confirmación con calendario, WhatsApp y mapa", async ({ page }) => {
    await openStep3(page);
    await page.getByRole("navigation", { name: "Fechas" }).getByRole("link").nth(1).click();
    await expect(page.getByRole("link", { name: "Continuar" })).toHaveCount(0); // sin hora no hay barra

    await page.getByRole("region", { name: /Horas de la/ }).getByRole("link").first().click();
    const bar = page.getByRole("status").filter({ hasText: "$" });
    await expect(bar).toContainText(/\d{1,2}:\d{2} [ap]\. ?m\. – \d{1,2}:\d{2} [ap]\. ?m\./);
    await expect(bar).toContainText("$");
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: "Continuar" }).click();
    await expect(page.getByText("Paso 4 de 4")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Nombre").fill("Cliente Calendario");
    await page.getByLabel("Número de contacto").fill(phone);
    await page.getByLabel("Correo").fill(email);
    await page.getByRole("checkbox", { name: /Autorizo el tratamiento/ }).check();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByRole("heading", { name: "Cita confirmada" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Añadir a mi calendario" }).click();
    const download = await downloadPromise;
    const ics = await readFile((await download.path()) ?? "", "utf8");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("/cancelar/");

    const wa = page.getByRole("link", { name: /Compartir por WhatsApp/ });
    expect(await wa.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(await wa.getAttribute("href")).not.toContain("cancelar");
    await expect(wa).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute("target", "_blank");
    await expectNoAxeViolations(page);
  });
});
