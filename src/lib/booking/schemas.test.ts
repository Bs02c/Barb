import { describe, expect, it } from "vitest";
import { bookingSchema } from "./schemas";

const valid = {
  service_id: "22222222-0000-4000-8000-000000000001",
  barber_id: "11111111-0000-4000-8000-0000000000b1",
  starts_at: "2026-10-13T15:00:00.000Z",
  customer_name: " Carlos Pérez ",
  customer_phone: "300 123 4567",
  customer_email: " Carlos@Example.com ",
  consent: "on",
};

describe("bookingSchema", () => {
  it("acepta una reserva válida y normaliza nombre, teléfono y correo", () => {
    expect(bookingSchema.parse(valid)).toMatchObject({
      customer_name: "Carlos Pérez",
      customer_phone: "+573001234567",
      customer_email: "carlos@example.com",
    });
  });

  it('acepta "pronto" como barbero', () => {
    expect(bookingSchema.safeParse({ ...valid, barber_id: "pronto" }).success).toBe(true);
  });

  it("exige el consentimiento", () => {
    const withoutConsent: Partial<typeof valid> = { ...valid };
    delete withoutConsent.consent;
    const result = bookingSchema.safeParse(withoutConsent);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain("consent");
  });

  it("rechaza caracteres de control y de formato en el nombre", () => {
    expect(bookingSchema.safeParse({ ...valid, customer_name: "Ana\u0000" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...valid, customer_name: "Ana\nPérez" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...valid, customer_name: "Ana ‮oterp" }).success).toBe(false); // override bidi
    expect(bookingSchema.safeParse({ ...valid, customer_name: "José María Ñúñez-O'Neil" }).success).toBe(true);
  });

  it("rechaza teléfono, correo, hora o barbero inválidos", () => {
    expect(bookingSchema.safeParse({ ...valid, customer_phone: "123" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...valid, customer_email: "no-es-correo" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...valid, starts_at: "mañana a las 10" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...valid, barber_id: "cualquiera" }).success).toBe(false);
  });
});
