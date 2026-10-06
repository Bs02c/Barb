import { randomUUID } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

// Cancelación con enlace seguro en vista móvil (spec 003, US1 y US2). Reserva en labarberia,
// lee el correo del .outbox/ (EMAIL_TRANSPORT=outbox en playwright.config.ts), cancela y limpia.
// Solo corre contra Supabase local (ADR-014).
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Este test solo corre contra Supabase local: revisa .env.local"); // ADR-014
}
if (!secretKey) throw new Error("Falta SUPABASE_SECRET_KEY en .env.local");

const db = createClient<Database>(url, secretKey, { auth: { persistSession: false } });
const outboxDir = path.resolve(".outbox");

const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
const phone = `3${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

test.use({ viewport: { width: 375, height: 812 } });

/** Archivos de .outbox/ cuyo "to" es el correo de esta ejecución. */
async function outboxFiles(): Promise<{ file: string; mail: { to: string; text: string } }[]> {
  const names = await readdir(outboxDir).catch(() => [] as string[]);
  const found: { file: string; mail: { to: string; text: string } }[] = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const file = path.join(outboxDir, name);
    try {
      const mail = JSON.parse(await readFile(file, "utf8"));
      if (mail.to === email) found.push({ file, mail });
    } catch {
      // archivo a medio escribir: se reintenta en la siguiente vuelta
    }
  }
  return found;
}

test.afterAll(async () => {
  for (const { file } of await outboxFiles()) await rm(file, { force: true });
  const { data: barbershop } = await db.from("barbershops").select("id").eq("subdomain", "labarberia").single();
  if (!barbershop) return;
  const { error } = await db
    .from("appointments")
    .delete()
    .eq("barbershop_id", barbershop.id)
    .eq("customer_email", email);
  if (error) throw error;
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("un cliente cancela su cita desde el enlace del correo", async ({ page }) => {
  // 1. Reservar con «Lo más pronto» (va directo al formulario).
  await page.goto("/reservar");
  await page.getByRole("main").getByRole("listitem").first().getByRole("link").click();
  await page.getByRole("link", { name: /Lo más pronto/ }).click();
  await expect(page.getByText("Paso 3 de 3")).toBeVisible();
  await page.waitForLoadState("networkidle"); // formulario hidratado antes de enviar
  await page.getByLabel("Nombre").fill("Cliente E2E");
  await page.getByLabel("Número de contacto").fill(phone);
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("checkbox", { name: /Autorizo el tratamiento/ }).check();
  await page.getByRole("button", { name: "Reservar cita" }).click();
  await expect(page.getByRole("heading", { name: "Cita confirmada" })).toBeVisible();

  // 2. El correo se escribe tras la respuesta: esperar hasta 10 s.
  await expect.poll(async () => (await outboxFiles()).length, { timeout: 10_000 }).toBeGreaterThan(0);

  // 3. Extraer el enlace del texto.
  const [{ mail }] = await outboxFiles();
  const link = mail.text.match(/https?:\/\/\S+\/cancelar\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(link).toBeTruthy();

  // 4. Abrir el enlace: no cancela. Recargar y comprobar que sigue activa.
  await page.goto(link!);
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expectNoAxeViolations(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Cancelar cita" })).toBeVisible();

  // 5. Cancelar.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Cancelar cita" }).click();
  await expect(page.getByText("Tu cita fue cancelada")).toBeVisible();
  await expectNoAxeViolations(page);

  // 6. Reabrir el enlace.
  await page.goto(link!);
  await expect(page.getByText("ya está cancelada")).toBeVisible();
  await expectNoAxeViolations(page);

  // 7. Token inválido.
  await page.goto(`/cancelar/${"a".repeat(43)}`);
  await expect(page.getByText("no es válido")).toBeVisible();
  await expectNoAxeViolations(page);
});
