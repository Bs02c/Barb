import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestAdmin, deleteBarbershop, deleteUser, insert, query } from "./helpers/db";

// Test obligatorio 2 del ADR-017: el panel no filtra por barbería en el código (riesgo aceptado), así
// que el aislamiento depende SOLO de RLS con la conexión real de la app (app_login → authenticated).
// Se llaman las funciones reales del panel como admin de A, con ids de B, y se comprueba como
// db_owner que B no cambió. Next.js se sustituye solo en lo que no existe fuera de una petición:
// cabeceras (con la cookie de la sesión real de A), revalidatePath y redirect.

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

const { POST } = await import("@/app/api/auth/[...all]/route");
const actions = await import("@/lib/admin/actions");
const queries = await import("@/lib/admin/queries");
const { getAdminContext } = await import("@/lib/admin/session");
const { getVerifiedSession } = await import("@/lib/auth/session");
const { withAdmin } = await import("@/lib/db/client");
const { toDbError } = await import("@/lib/db/errors");
const { barbers } = await import("@/lib/db/schema");

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const initial = { ok: true, message: "" } as const;

type Shop = { id: string; subdomain: string; name: string; timezone: string };
const ids = { barber: "", service: "", slot: "", block: "", appointment: "" };
let shopA: Shop;
let shopB: Shop;
let adminA: { userId: string };
let adminB: { userId: string };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Estado de los datos de B, leído como db_owner (sin RLS). */
async function snapshotB() {
  return {
    barbers: await query("select id, name, is_active from public.barbers where barbershop_id = $1 order by id", [shopB.id]),
    services: await query("select id, name, price, is_active from public.services where barbershop_id = $1 order by id", [shopB.id]),
    slots: await query("select id from public.barber_schedules where barbershop_id = $1 order by id", [shopB.id]),
    blocks: await query("select id from public.barber_blocks where barbershop_id = $1 order by id", [shopB.id]),
    appointments: await query("select id, status from public.appointments where barbershop_id = $1 order by id", [shopB.id]),
  };
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  shopA = await insert<Shop>("barbershops", { name: "Test A", subdomain: `test-iso-a-${suffix}` });
  shopB = await insert<Shop>("barbershops", { name: "Test B", subdomain: `test-iso-b-${suffix}` });
  const emailA = `admin-a-${suffix}@example.com`;
  const credentialsA = await createTestAdmin(shopA.id, emailA);
  adminA = credentialsA;
  adminB = await createTestAdmin(shopB.id, `admin-b-${suffix}@example.com`);

  await insert("barbers", { barbershop_id: shopA.id, name: "Barbero A" });
  ids.barber = (await insert<{ id: string }>("barbers", { barbershop_id: shopB.id, name: "Barbero B" })).id;
  ids.service = (
    await insert<{ id: string }>("services", { barbershop_id: shopB.id, name: "Corte B", duration_minutes: 30, price: 1000 })
  ).id;
  ids.slot = (
    await insert<{ id: string }>("barber_schedules", { barbershop_id: shopB.id, barber_id: ids.barber, weekday: 1, start_time: "09:00", end_time: "13:00" })
  ).id;
  ids.block = (
    await insert<{ id: string }>("barber_blocks", { barbershop_id: shopB.id, barber_id: ids.barber, starts_at: "2030-02-01T15:00:00Z", ends_at: "2030-02-01T17:00:00Z" })
  ).id;
  ids.appointment = (
    await insert<{ id: string }>("appointments", {
      barbershop_id: shopB.id,
      barber_id: ids.barber,
      service_id: ids.service,
      starts_at: "2030-02-02T15:00:00Z",
      ends_at: "2030-02-02T15:30:00Z",
      service_duration_minutes: 30,
      service_price: 1000,
      customer_name: "Cliente B",
      customer_phone: "+573001112233",
      customer_email: "b@example.com",
      data_consent_at: "2030-01-01T00:00:00Z",
    })
  ).id;

  // Sesión REAL de A: login por la ruta de Better Auth en el subdominio de A.
  const host = `${shopA.subdomain}.${ROOT}`;
  const res = await POST(
    new Request(`http://${host}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { host, origin: `http://${host}`, "content-type": "application/json", "x-real-ip": "203.0.113.200" },
      body: JSON.stringify({ email: emailA, password: credentialsA.password }),
    }),
  );
  if (res.status !== 200) throw new Error(`login de A falló: ${res.status}`);
  const cookie = res.headers.getSetCookie().find((c) => c.includes("session_token"))!.split(";")[0];
  requestHeaders = new Headers({ host, cookie });
});

afterAll(async () => {
  await deleteUser(adminA?.userId);
  await deleteUser(adminB?.userId);
  await deleteBarbershop(shopA?.id);
  await deleteBarbershop(shopB?.id);
});

describe("admin de A con ids de B (las 15 operaciones del panel)", () => {
  it("1–2. getAdminContext: A entra en su panel y no en el de B", async () => {
    expect((await getAdminContext(shopA.subdomain)).status).toBe("ok");
    expect((await getAdminContext(shopB.subdomain)).status).toBe("forbidden");
  });

  it("3–6. las lecturas del panel solo devuelven datos de A", async () => {
    const [barberList, serviceList, slots, blocks] = await Promise.all([
      queries.listBarbers(),
      queries.listServices(),
      queries.listScheduleSlots(),
      queries.listUpcomingBlocks(),
    ]);
    expect(barberList.map((b) => b.name)).toEqual(["Barbero A"]);
    expect(serviceList).toEqual([]);
    expect(slots.map((s) => s.id)).not.toContain(ids.slot);
    expect(blocks.map((b) => b.id)).not.toContain(ids.block);
  });

  it("7. la agenda de un día de B, pedida por A, sale vacía", async () => {
    expect(await queries.listAppointmentsForDay(shopB, "2030-02-02")).toEqual([]);
    expect(await queries.listAppointmentsForDay(shopB, "2030-02-02", ids.barber)).toEqual([]);
  });

  it("8–14. modificar, borrar o cancelar datos de B no tiene efecto", async () => {
    const before = await snapshotB();
    const a = shopA.subdomain;
    await actions.renameBarber(a, initial, form({ id: ids.barber, name: "Hackeado" }));
    await actions.setBarberActive(a, initial, form({ id: ids.barber, is_active: "false" }));
    await actions.deleteBarber(a, initial, form({ id: ids.barber }));
    await actions.updateService(a, initial, form({ id: ids.service, name: "Hackeado", duration_minutes: "10", price: "1" }));
    await actions.setServiceActive(a, initial, form({ id: ids.service, is_active: "false" }));
    await actions.deleteService(a, initial, form({ id: ids.service }));
    await actions.deleteScheduleSlot(a, initial, form({ id: ids.slot }));
    await actions.deleteBlock(a, initial, form({ id: ids.block }));
    const cancel = await actions.adminCancelAppointment(a, initial, form({ id: ids.appointment }));
    expect(cancel).toMatchObject({ ok: false, message: "Esta cita ya no se puede cancelar." });
    expect(await snapshotB()).toEqual(before);
  });

  it("15. crear en A con un barbero de B se rechaza, y nada aparece en B", async () => {
    const before = await snapshotB();
    const a = shopA.subdomain;
    const slot = await actions.addScheduleSlot(a, initial, form({ barber_id: ids.barber, weekday: "2", start_time: "09:00", end_time: "10:00" }));
    const block = await actions.addBlock(a, initial, form({ barber_id: ids.barber, starts_at: "2030-03-01T09:00", ends_at: "2030-03-01T10:00" }));
    expect(slot.ok).toBe(false);
    expect(block.ok).toBe(false);
    expect(await snapshotB()).toEqual(before);
  });

  it("15. un INSERT con barbershop_id de B (saltándose la acción) lo rechaza RLS con 42501", async () => {
    const session = await getVerifiedSession();
    const error = await withAdmin(session!, (tx) => tx.insert(barbers).values({ barbershopId: shopB.id, name: "Intruso" })).then(
      () => null,
      (e: unknown) => e,
    );
    expect(toDbError(error)?.code).toBe("42501");
    expect((await snapshotB()).barbers.map((b) => b.name)).not.toContain("Intruso");
  });
});
