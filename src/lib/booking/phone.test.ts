import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("añade +57 a un celular colombiano de 10 dígitos", () => {
    expect(normalizePhone("3001234567")).toBe("+573001234567");
  });

  it("quita espacios, guiones, puntos y paréntesis", () => {
    expect(normalizePhone(" 300 123-4567 ")).toBe("+573001234567");
    expect(normalizePhone("(300) 123.45.67")).toBe("+573001234567");
  });

  it("acepta el número con 57 sin + y con prefijo internacional", () => {
    expect(normalizePhone("573001234567")).toBe("+573001234567");
    expect(normalizePhone("+57 300 123 4567")).toBe("+573001234567");
    expect(normalizePhone("+34 612 345 678")).toBe("+34612345678");
  });

  it("rechaza números incompletos, fijos sin prefijo o con letras", () => {
    expect(normalizePhone("300123")).toBeNull();
    expect(normalizePhone("6012345678")).toBeNull(); // fijo de Bogotá sin +57: ambiguo
    expect(normalizePhone("300abc4567")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
  });
});
