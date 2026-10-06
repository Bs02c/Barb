import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { confirmationEmail } = await import("./confirmation");
const { sendEmail } = await import("./send");

const data = {
  to: "cliente@example.com",
  barbershopName: `<b>"X"</b>`,
  summary: {
    serviceName: "Corte",
    barberName: "Andrés",
    startsAtLabel: "mar, 13 oct, 10:00 a. m.",
    durationMinutes: 45,
    priceLabel: "$ 25.000",
  },
  cancelUrl: "http://labarberia.localhost:3000/cancelar/" + "a".repeat(43),
};

describe("confirmationEmail", () => {
  it("escapa los valores dinámicos en el HTML", () => {
    const { html, subject } = confirmationEmail(data);
    expect(html).toContain("&lt;b&gt;&quot;X&quot;&lt;/b&gt;");
    expect(html).not.toContain(`<b>"X"</b>`);
    expect(subject).toContain("Cita confirmada en");
  });

  it("el texto incluye fecha, hora y enlace; el HTML, el botón", () => {
    const { text, html } = confirmationEmail(data);
    expect(text).toContain("mar, 13 oct, 10:00 a. m.");
    expect(text).toContain(data.cancelUrl);
    expect(html).toContain(`href="${data.cancelUrl}"`);
    expect(html).toContain("Cancelar cita");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendConfirmation (FR-002, FR-011)", () => {
  it("no lanza si el envío falla y no registra el correo ni el enlace", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Reservas <x@example.com>");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendConfirmation } = await import("./confirmation");
    await expect(sendConfirmation(data)).resolves.toBeUndefined();

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("validation_error");
    expect(logged).not.toContain(data.to);
    expect(logged).not.toContain(data.cancelUrl);
  });
});

describe("sendEmail (producción y Resend)", () => {
  const email = { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" };

  it("rechaza el transporte outbox en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_TRANSPORT", "outbox");
    await expect(sendEmail(email)).rejects.toThrow(/producción/);
  });

  it("sin EMAIL_TRANSPORT, fuera de desarrollo y tests usa Resend (y exige sus variables)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmail(email)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("una respuesta no 2xx lanza un error con el nombre de Resend y sin el cuerpo", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Reservas <x@example.com>");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "to: a@example.com" }), { status: 422 })));
    const error = await sendEmail(email).catch((e: unknown) => e as Error & { code?: string });
    expect(error).toMatchObject({ code: "validation_error" });
    expect((error as Error).message).not.toContain("a@example.com");
  });
});

describe("sendEmail (outbox)", () => {
  it("escribe un archivo con los campos del correo", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "outbox");
    const dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    const email = { to: data.to, ...confirmationEmail(data) };
    await sendEmail(email, dir);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(dir, files[0]), "utf8"))).toEqual(email);
  });
});
