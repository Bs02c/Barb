import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdmin, deleteBarbershop, deleteUser, insert, query } from "./helpers/db";

// Login con Better Auth (spec 005: historia 2, FR-016 a FR-019; test obligatorio 8 del ADR-017).
// Se prueba la ruta real de la app (src/app/api/auth/[...all]/route.ts), con su lista blanca.
// Límite de intentos bajo solo para este archivo: la instancia de Better Auth se crea después.
const MAX_ATTEMPTS = 3;
process.env.AUTH_SIGNIN_MAX_ATTEMPTS = String(MAX_ATTEMPTS);
(globalThis as { __auth?: unknown }).__auth = undefined;
const { GET, POST } = await import("@/app/api/auth/[...all]/route");

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
let shopId: string;
let subdomain: string;
let admin: { userId: string; email: string; password: string };

beforeAll(async () => {
  subdomain = `test-auth-${randomUUID().slice(0, 8)}`;
  shopId = (await insert<{ id: string }>("barbershops", { name: "Test login", subdomain })).id;
  admin = await createTestAdmin(shopId, `admin-${subdomain}@example.com`);
});

afterAll(async () => {
  await deleteUser(admin?.userId);
  await deleteBarbershop(shopId);
  await query(`delete from identity."rateLimit" where key like '%203.0.113.%'`);
});

function request(path: string, init: { method?: string; body?: unknown; cookie?: string; ip?: string } = {}) {
  const origin = `http://${subdomain}.${ROOT}`;
  const headers: Record<string, string> = { host: `${subdomain}.${ROOT}`, origin, "x-real-ip": init.ip ?? "203.0.113.1" };
  if (init.body) headers["content-type"] = "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`${origin}/api/auth${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

const send = (req: Request) => (req.method === "GET" ? GET(req) : POST(req));

/** "nombre=valor" de la cookie de sesión de una respuesta. */
function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.includes("session_token"));
  if (!raw) throw new Error("sin cookie de sesión");
  return raw.split(";")[0];
}

describe("registro y rutas fuera de la lista blanca", () => {
  it("no hay registro: /sign-up/email responde 404", async () => {
    const res = await send(request("/sign-up/email", { body: { email: "nuevo@example.com", password: "Una-Clave-Larga-1", name: "x" } }));
    expect(res.status).toBe(404);
    expect(await query(`select 1 from identity."user" where email = 'nuevo@example.com'`)).toHaveLength(0);
  });

  it.each(["/request-password-reset", "/reset-password/abc", "/update-user", "/delete-user", "/change-email", "/list-sessions", "/callback/google"])(
    "%s responde 404",
    async (path) => {
      expect((await send(request(path, { body: {} }))).status).toBe(404);
    },
  );
});

describe("inicio y cierre de sesión", () => {
  it("con credenciales correctas devuelve una cookie solo del host, HttpOnly y SameSite=Lax", async () => {
    const res = await send(request("/sign-in/email", { body: { email: admin.email, password: admin.password }, ip: "203.0.113.10" }));
    expect(res.status).toBe(200);
    const raw = res.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).not.toMatch(/Domain=/i);
  });

  it("credenciales erróneas y correo inexistente responden igual (401, mismo cuerpo)", async () => {
    const wrong = await send(request("/sign-in/email", { body: { email: admin.email, password: "mala" }, ip: "203.0.113.11" }));
    const missing = await send(request("/sign-in/email", { body: { email: "nadie@example.com", password: "mala" }, ip: "203.0.113.12" }));
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it("tras cerrar sesión, la cookie ya no da sesión", async () => {
    const login = await send(request("/sign-in/email", { body: { email: admin.email, password: admin.password }, ip: "203.0.113.13" }));
    const cookie = sessionCookie(login);
    expect(await (await send(request("/get-session", { cookie }))).json()).not.toBeNull();

    expect((await send(request("/sign-out", { method: "POST", body: {}, cookie }))).status).toBe(200);
    expect(await (await send(request("/get-session", { cookie }))).json()).toBeNull();
  });

  it("si se borra el usuario, su sesión deja de valer (cascada)", async () => {
    const other = await createTestAdmin(shopId, `otro-${subdomain}@example.com`);
    const login = await send(request("/sign-in/email", { body: { email: other.email, password: other.password }, ip: "203.0.113.14" }));
    const cookie = sessionCookie(login);
    await deleteUser(other.userId);
    expect(await (await send(request("/get-session", { cookie }))).json()).toBeNull();
  });
});

describe("límite de intentos (en la base, por IP de X-Real-IP)", () => {
  it(`el intento ${MAX_ATTEMPTS + 1} desde la misma IP responde 429; otra IP no queda bloqueada`, async () => {
    const attempt = (ip: string) =>
      send(request("/sign-in/email", { body: { email: admin.email, password: "mala" }, ip }));
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await attempt("203.0.113.50")).status).toBe(401);
    expect((await attempt("203.0.113.50")).status).toBe(429);
    expect((await attempt("203.0.113.51")).status).toBe(401);
    const rows = await query(`select 1 from identity."rateLimit" where key like '%203.0.113.50%'`);
    expect(rows.length).toBeGreaterThan(0); // guardado en la base, no en memoria
  });
});
