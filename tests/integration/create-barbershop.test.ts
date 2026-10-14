import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { query } from "./helpers/db";

// Alta de barberías por el super admin (spec 005: historia 4, T044): barbería, usuario de Better Auth,
// cuenta con contraseña y perfil en UNA transacción, sin abrir el registro. Se ejecuta el script real.

const run = promisify(execFile);
const { POST } = await import("@/app/api/auth/[...all]/route");
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const suffix = randomUUID().slice(0, 8);
const subdomain = `test-alta-${suffix}`;
const email = `alta-${suffix}@example.com`;

function createBarbershop(sub: string, mail: string) {
  return run(
    process.execPath,
    ["scripts/create-barbershop.mts", "--name", "Alta de prueba", "--subdomain", sub, "--admin-email", mail],
    { env: process.env },
  ).then(
    (r) => ({ code: 0, out: r.stdout, err: r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout, err: e.stderr }),
  );
}

afterAll(async () => {
  await query(`delete from identity."user" where email like $1`, [`%-${suffix}@example.com`]);
  await query("delete from public.barbershops where subdomain = $1", [subdomain]);
});

describe("scripts/create-barbershop.mts", () => {
  it("crea barbería, usuario, cuenta y perfil, y el admin puede entrar con la contraseña impresa", async () => {
    const result = await createBarbershop(subdomain, email);
    expect(result.code).toBe(0);
    const password = /Contraseña \(se muestra una sola vez\): (\S+)/.exec(result.out)?.[1];
    expect(password).toBeTruthy();

    const [row] = await query<{ role: string; subdomain: string }>(
      `select p.role, b.subdomain from public.profiles p
         join identity."user" u on u.id = p.user_id
         join public.barbershops b on b.id = p.barbershop_id
        where u.email = $1`,
      [email],
    );
    expect(row).toEqual({ role: "admin", subdomain });

    const host = `${subdomain}.${ROOT}`;
    const login = await POST(
      new Request(`http://${host}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { host, origin: `http://${host}`, "content-type": "application/json", "x-real-ip": "203.0.113.150" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(login.status).toBe(200);
  });

  it("un subdominio repetido falla con mensaje claro y no deja filas a medias", async () => {
    const otherEmail = `repetido-${suffix}@example.com`;
    const result = await createBarbershop(subdomain, otherEmail);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(`El subdominio "${subdomain}" ya está en uso.`);
    expect(await query(`select 1 from identity."user" where email = $1`, [otherEmail])).toHaveLength(0);
  });

  it("se niega a escribir en una base sin la marca local aunque sea 127.0.0.1 (túnel SSH al VPS)", async () => {
    // Misma base local, pero la conexión sobrescribe app.env: es lo que vería un túnel a otra base.
    const tunnel = new URL(process.env.DATABASE_OWNER_URL!);
    tunnel.searchParams.set("options", "-c app.env=remoto");
    const result = await run(
      process.execPath,
      ["scripts/create-barbershop.mts", "--name", "X", "--subdomain", `x-${suffix}`, "--admin-email", `x-${suffix}@example.com`],
      { env: { ...process.env, DATABASE_OWNER_URL: tunnel.toString() } },
    ).then(
      () => ({ err: "" }),
      (e: { stderr: string }) => ({ err: e.stderr }),
    );
    expect(result.err).toContain("El destino es remoto");
    expect(await query("select 1 from public.barbershops where subdomain = $1", [`x-${suffix}`])).toHaveLength(0);
  });
});
