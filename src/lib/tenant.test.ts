import { describe, expect, it } from "vitest";
import { resolveTenant } from "./tenant";

describe("resolveTenant", () => {
  const prod = "midominio.com";
  const local = "localhost:3000";

  it("reconoce el dominio raíz y www como la plataforma", () => {
    expect(resolveTenant("midominio.com", prod)).toEqual({ kind: "root" });
    expect(resolveTenant("www.midominio.com", prod)).toEqual({ kind: "root" });
    expect(resolveTenant("localhost:3000", local)).toEqual({ kind: "root" });
  });

  it("extrae el subdominio de una barbería, ignorando puerto y mayúsculas", () => {
    expect(resolveTenant("labarberia.midominio.com", prod)).toEqual({
      kind: "tenant",
      subdomain: "labarberia",
    });
    expect(resolveTenant("LaBarberia.localhost:3000", local)).toEqual({
      kind: "tenant",
      subdomain: "labarberia",
    });
    expect(resolveTenant("el-corte-2.midominio.com", prod)).toEqual({
      kind: "tenant",
      subdomain: "el-corte-2",
    });
  });

  it("rechaza subdominios reservados", () => {
    for (const reserved of ["app", "api", "admin"]) {
      expect(resolveTenant(`${reserved}.midominio.com`, prod)).toEqual({ kind: "invalid" });
    }
  });

  it("rechaza subdominios con formato inválido o de varios niveles", () => {
    expect(resolveTenant("-mal.midominio.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant("mal-.midominio.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant("con_guion_bajo.midominio.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant("a.b.midominio.com", prod)).toEqual({ kind: "invalid" });
  });

  it("rechaza hosts ajenos al dominio raíz o ausentes", () => {
    expect(resolveTenant("otrodominio.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant("midominio.com.atacante.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant("falsomidominio.com", prod)).toEqual({ kind: "invalid" });
    expect(resolveTenant(null, prod)).toEqual({ kind: "invalid" });
  });
});
