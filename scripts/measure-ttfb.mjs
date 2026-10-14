// Mide el tiempo hasta el primer byte (TTFB) de la portada (/), /reservar y /admin (spec 005, FR-023 y
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
  const { hostname, port, pathname } = new URL(url);
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = request(
      { host: "127.0.0.1", port, path: pathname, headers: { host: `${hostname}:${port}`, ...(cookie ? { cookie } : {}) } },
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
const admin = await measure("/admin", cookie);

console.log(`Mediciones (${RUNS} peticiones, ${WARMUP} de calentamiento), en ms:`);
console.log(`| Ruta | Mediana | p90 |`);
console.log(`|---|---|---|`);
console.log(`| / | ${home.median} | ${home.p90} |`);
console.log(`| /reservar | ${reservar.median} | ${reservar.p90} |`);
console.log(`| /admin | ${admin.median} | ${admin.p90} |`);
