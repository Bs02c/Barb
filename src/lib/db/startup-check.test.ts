import { describe, expect, it } from "vitest";
import { roleProblems } from "./startup-check";

// Reglas de la comprobación al arrancar (spec 005, FR-014). La consulta real a pg_roles se prueba en
// integración; aquí, qué se considera inseguro.
const safe = {
  user: "app_login",
  superuser: false,
  bypassrls: false,
  owns_objects: false,
  inheriting_memberships: 0,
  admin_memberships: 0,
  member_of: ["authenticated", "service_role"],
  business_privileges: false,
  identity_privileges: false,
};

describe("roleProblems", () => {
  it("acepta app_login sin privilegios propios", () => {
    expect(roleProblems(safe, "app_login")).toEqual([]);
  });

  it("acepta auth_login sin membresías", () => {
    expect(roleProblems({ ...safe, user: "auth_login", member_of: [], identity_privileges: true }, "auth_login")).toEqual([]);
  });

  it("rechaza que auth_login pueda cambiar a otro rol", () => {
    expect(roleProblems({ ...safe, user: "auth_login", member_of: ["service_role"] }, "auth_login").join(" ")).toContain("solo debe poder cambiar");
  });

  it.each([
    [{ superuser: true }, "superusuario"],
    [{ bypassrls: true }, "BYPASSRLS"],
    [{ owns_objects: true }, "dueño"],
    [{ inheriting_memberships: 1 }, "hereda"],
    [{ user: "db_owner" }, "debe ser"],
    [{ admin_memberships: 1 }, "ADMIN OPTION"],
    [{ member_of: ["authenticated", "db_owner", "service_role"] }, "solo debe poder cambiar"],
    [{ member_of: ["authenticated"] }, "solo debe poder cambiar"],
    [{ business_privileges: true }, "privilegios propios sobre tablas de negocio"],
    [{ identity_privileges: true }, "tablas del login"],
  ])("rechaza %o", (override, reason) => {
    const problems = roleProblems({ ...safe, ...override }, "app_login");
    expect(problems.join(" ")).toContain(reason);
  });
});
