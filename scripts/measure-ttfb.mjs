// Mide el tiempo hasta el primer byte (TTFB) de la portada (/), /reservar (pasos 1, 3 y 4) y /admin (spec 005, FR-023 y
// SC-005; spec 006, SC-005).
// Uso: con la app en marcha en modo producción (`npm run build && npm run start`):
//   npm run perf:ttfb
// Inicia sesión una vez con el admin de demostración por la interfaz (Playwright) para obtener la
// cookie del panel y luego hace peticiones secuenciales con node:http. Solo local.

import { request } from "node:http";
import { chromium } from "@playwright/test";

const BASE = process.env.TTFB_BASE_URL ?? "http://labarberia.localhost:3000";
const EMAIL = process.env.TTFB_ADMIN_EMAIL ?? "admin@labarberia.example.com";
const PASSWORD = process.env.TTFB_ADMIN_PASSWORD ?? "Demo-Barberia-2026"; // contraseña de demostración del seed local
const RUNS = 30;
const WARMUP = 5;

if (!new URL(BASE).hostname.endsWith("localhost")) {
  console.error("✗ Solo se mide contra la app local.");
  process.exit(1);
}

async function adminCookie() {
  // Chromium de Playwright si está instalado; si no, Edge del sistema (Windows).
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Correo").fill(EMAIL);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("heading", { name: "Agenda" }).waitFor();
    const cookies = await page.context().cookies();
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

/**
 * Milisegundos hasta que llegan las cabeceras de la respuesta (TTFB). Node no resuelve *.localhost,
 * así que se conecta a 127.0.0.1 y envía el subdominio en la cabecera Host.
 */
function ttfb(url, cookie) {
  const { hostname, port, pathname, search } = new URL(url);
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = request(
      { host: "127.0.0.1", port, path: pathname + search, headers: { host: `${hostname}:${port}`, ...(cookie ? { cookie } : {}) } },
      (res) => {
        const elapsed = performance.now() - start;
        res.resume(); // consumir el cuerpo antes de la siguiente petición
        res.on("end", () =>
          res.statusCode === 200 ? resolve(elapsed) : reject(new Error(`${url} respondió ${res.statusCode}`)),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Rutas del paso 3 (fecha y hora elegidas, con la barra) y del paso 4 (datos=1), recorriendo la reserva
 * por la interfaz: los ids cambian con cada db:reset (revisión spec 007, PERF-002).
 */
async function bookingStepPaths() {
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`);
    await page.locator('a[href*="/reservar?servicio="]').first().click();
    await page.getByRole("heading", { name: "Elige un barbero" }).waitFor();
    await page.locator("main ul li a").nth(1).click(); // primer barbero (el 0 es "Lo más pronto")
    await page.getByRole("navigation", { name: "Fechas" }).getByRole("link").first().click();
    await page.waitForURL(/dia=/);
    await page.locator('a[href*="hora="]').first().click();
    await page.waitForURL(/hora=/);
    const step3 = new URL(page.url());
    await page.getByRole("link", { name: "Continuar" }).click();
    await page.waitForURL(/datos=1/);
    const step4 = new URL(page.url());
    return { step3: step3.pathname + step3.search, step4: step4.pathname + step4.search };
  } finally {
    await browser.close();
  }
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { median: at(0.5).toFixed(1), p90: at(0.9).toFixed(1) };
}

async function measure(path, cookie) {
  const samples = [];
  for (let i = 0; i < RUNS + WARMUP; i++) {
    const ms = await ttfb(`${BASE}${path}`, cookie);
    if (i >= WARMUP) samples.push(ms);
  }
  return stats(samples);
}

const cookie = await adminCookie();
const home = await measure("/");
const reservar = await measure("/reservar");
const steps = await bookingStepPaths();
const step3 = await measure(steps.step3);
const step4 = await measure(steps.step4);
const admin = await measure("/admin", cookie);

console.log(`Mediciones (${RUNS} peticiones, ${WARMUP} de calentamiento), en ms:`);
console.log(`| Ruta | Mediana | p90 |`);
console.log(`|---|---|---|`);
console.log(`| / | ${home.median} | ${home.p90} |`);
console.log(`| /reservar | ${reservar.median} | ${reservar.p90} |`);
console.log(`| /reservar paso 3 (fecha y hora) | ${step3.median} | ${step3.p90} |`);
console.log(`| /reservar paso 4 (datos) | ${step4.median} | ${step4.p90} |`);
console.log(`| /admin | ${admin.median} | ${admin.p90} |`);
