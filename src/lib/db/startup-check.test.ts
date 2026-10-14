import { describe, expect, it } from "vitest";
import { roleProblems } from "./startup-check";

// Reglas de la comprobación al arrancar (spec 005, FR-014). La consulta real a pg_roles se prueba en
// integración; aquí, qué se considera inseguro.
const safe = { user: "app_login", superuser: false, bypassrls: false, owns_objects: false, inheriting_memberships: 0 };

describe("roleProblems", () => {
  it("acepta app_login sin privilegios propios", () => {
    expect(roleProblems(safe, "app_login")).toEqual([]);
  });

  it.each([
    [{ superuser: true }, "superusuario"],
    [{ bypassrls: true }, "BYPASSRLS"],
    [{ owns_objects: true }, "dueño"],
    [{ inheriting_memberships: 1 }, "hereda"],
    [{ user: "db_owner" }, "debe ser"],
  ])("rechaza %o", (override, reason) => {
    const problems = roleProblems({ ...safe, ...override }, "app_login");
    expect(problems.join(" ")).toContain(reason);
  });
});
