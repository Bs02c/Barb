import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logSafeError } from "@/lib/log";
import { carriesQuery, toDbError } from "./errors";

// Test obligatorio 10 del ADR-017: la traducción de errores de la base decide solo por código y
// restricción, y nunca deja pasar datos del cliente (spec 005, research §8).

/** Error como el `DatabaseError` de `pg`: con detalle que contiene datos personales. */
function pgError(code: string, constraint?: string) {
  return Object.assign(new Error("valor rechazado"), {
    code,
    severity: "ERROR",
    constraint,
    detail: "Failing row contains (Ana Pérez, +573001112233, ana@example.com).",
  });
}

const PHONE = "+573001112233";

describe("toDbError", () => {
  it.each([
    ["23P01", "appointments_no_overlap"],
    ["40P01", undefined],
    ["23505", "barbershops_subdomain_key"],
    ["23503", "appointments_barber_fkey"],
    ["23514", "appointments_phone_limit"],
    ["42501", undefined],
  ])("traduce %s con su restricción", (code, constraint) => {
    expect(toDbError(pgError(code, constraint))).toEqual({ code, constraint: constraint ?? null });
  });

  it("desenvuelve el error de Drizzle y no deja rastro de la consulta ni de los parámetros", () => {
    const wrapped = new DrizzleQueryError(
      "insert into appointments (customer_phone) values ($1)",
      [PHONE],
      pgError("23514", "appointments_phone_limit"),
    );
    expect(wrapped.message).toContain(PHONE); // por eso existe toDbError
    const result = toDbError(wrapped);
    expect(result).toEqual({ code: "23514", constraint: "appointments_phone_limit" });
    expect(JSON.stringify(result)).not.toContain(PHONE);
    expect(carriesQuery(wrapped)).toBe(true);
  });

  it("devuelve null si el error no viene de PostgreSQL", () => {
    expect(toDbError(new Error("otra cosa"))).toBeNull();
    expect(toDbError(Object.assign(new Error("conexión rechazada"), { code: "ECONNREFUSED" }))).toBeNull();
    expect(toDbError(null)).toBeNull();
    expect(toDbError("texto")).toBeNull();
  });
});

describe("logSafeError", () => {
  afterEach(() => vi.restoreAllMocks());

  function logged(error: unknown): string {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSafeError("contexto", error);
    return JSON.stringify(spy.mock.calls);
  }

  it("de un error de PostgreSQL envuelto registra solo código y restricción", () => {
    const out = logged(new DrizzleQueryError("select $1", [PHONE], pgError("23505", "x_key")));
    expect(out).toContain("23505");
    expect(out).toContain("x_key");
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain("Failing row");
  });

  it("de un error de Drizzle sin error de PostgreSQL dentro no registra la consulta", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const out = logged(new DrizzleQueryError("select $1", [PHONE], cause));
    expect(out).toContain("ECONNREFUSED");
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain("select");
  });

  it("de otros errores conserva código y mensaje", () => {
    expect(logged(Object.assign(new Error("Resend respondió 500"), { code: "E1" }))).toContain("Resend respondió 500");
  });
});
