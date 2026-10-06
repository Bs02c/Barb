import { describe, expect, it, vi } from "vitest";
import { cancelTokenSchema } from "./schemas";

vi.mock("server-only", () => ({}));
const { cancelUrl, generateCancelToken, hashToken } = await import("./token");

describe("token de cancelación", () => {
  it("mide 43 caracteres, cumple el esquema y no se repite", () => {
    const a = generateCancelToken();
    const b = generateCancelToken();
    expect(a).toHaveLength(43);
    expect(cancelTokenSchema.safeParse(a).success).toBe(true);
    expect(a).not.toBe(b);
  });

  it("hashToken devuelve \\x + 64 hex y es determinista", () => {
    expect(hashToken("a".repeat(43))).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(hashToken("a".repeat(43))).toBe(hashToken("a".repeat(43)));
    expect(hashToken("a".repeat(43))).not.toBe(hashToken("b".repeat(43)));
  });

  it("el esquema rechaza formatos inválidos", () => {
    expect(cancelTokenSchema.safeParse("corto").success).toBe(false);
    expect(cancelTokenSchema.safeParse("a".repeat(42) + "!").success).toBe(false);
    expect(cancelTokenSchema.safeParse("a".repeat(44)).success).toBe(false);
  });

  it("cancelUrl usa http en local y https en un dominio real", () => {
    expect(cancelUrl("labarberia", "T", "localhost:3000")).toBe("http://labarberia.localhost:3000/cancelar/T");
    expect(cancelUrl("x", "T", "midominio.com")).toBe("https://x.midominio.com/cancelar/T");
  });
});
