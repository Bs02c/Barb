import { z } from "zod";

// Esquemas compartidos por los formularios (cliente) y las server actions (servidor).
// Mismas reglas que los check de la base de datos (db/migrations), con mensajes en español.

const name = z
  .string()
  .trim()
  .min(1, "Escribe un nombre.")
  .max(100, "Máximo 100 caracteres.");

const uuid = z.uuid("Identificador inválido.");

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:MM.");

// Número obligatorio desde un campo de formulario: "" no se convierte en 0.
const requiredNumber = (message: string) =>
  z.string().trim().min(1, message).pipe(z.coerce.number<string>(message));

/** Límites de los textos públicos de la portada (spec 006); iguales a los check de 0002_portada_barberia.sql. */
export const DESCRIPTION_MAX = 160;
export const ADDRESS_MAX = 200;
export const SERVICE_DESCRIPTION_MAX = 200;

// Texto opcional de una línea: sin espacios sobrantes, sin saltos de línea y "" → null ("sin dato").
// La base exige lo mismo (null o 1–N caracteres, = btrim, sin \r ni \n). Aquí además se rechazan los
// saltos de línea Unicode y los caracteres de control y de formato invisibles (incluidas las marcas
// bidi, que harían que la portada muestre un texto distinto del guardado; revisión spec 006, SEC-001).
const LINE_BREAK = /[\r\n\u0085\u2028\u2029]/;
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;
const optionalLine = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => v?.trim() ?? "")
    .pipe(
      z
        .string()
        .max(max, `Máximo ${max} caracteres.`)
        .refine((v) => !LINE_BREAK.test(v), "Escríbelo en una sola línea.")
        .refine((v) => LINE_BREAK.test(v) || !INVISIBLE.test(v), "Quita los caracteres especiales invisibles."),
    )
    .transform((v) => (v === "" ? null : v));

// "2026-10-13T10:00", como lo da <input type="datetime-local">.
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Elige fecha y hora.");

export const loginSchema = z.object({
  email: z.email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export const barberSchema = z.object({
  name,
});

export const serviceSchema = z.object({
  name,
  duration_minutes: requiredNumber("Escribe la duración en minutos.").pipe(
    z.number().int("Usa minutos enteros.").min(1, "Mínimo 1 minuto.").max(480, "Máximo 480 minutos (8 horas)."),
  ),
  // Pesos colombianos, sin decimales en la interfaz.
  price: requiredNumber("Escribe el precio.").pipe(
    z
      .number()
      .int("Escribe el precio sin decimales.")
      .min(0, "El precio no puede ser negativo.")
      .max(10_000_000, "Precio demasiado alto."),
  ),
  description: optionalLine(SERVICE_DESCRIPTION_MAX),
});

/** "Mi barbería": los dos únicos datos de su barbería que el admin puede cambiar (spec 006, FR-012). */
export const barbershopInfoSchema = z.object({
  description: optionalLine(DESCRIPTION_MAX),
  address: optionalLine(ADDRESS_MAX),
});

export const scheduleSlotSchema = z
  .object({
    barber_id: uuid,
    weekday: requiredNumber("Elige un día.").pipe(z.number().int().min(1, "Elige un día.").max(7, "Elige un día.")),
    start_time: timeOfDay,
    end_time: timeOfDay,
  })
  .refine((v) => v.end_time > v.start_time, {
    message: "La hora de fin debe ser posterior a la de inicio.",
    path: ["end_time"],
  });

export const blockSchema = z
  .object({
    barber_id: uuid,
    starts_at: localDateTime,
    ends_at: localDateTime,
    reason: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
  })
  .refine((v) => v.ends_at > v.starts_at, {
    message: "El fin debe ser posterior al inicio.",
    path: ["ends_at"],
  });

export const idSchema = z.object({ id: uuid });

export const activeSchema = z.object({
  id: uuid,
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export type BarberInput = z.infer<typeof barberSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>;
export type BlockInput = z.infer<typeof blockSchema>;
export type BarbershopInfoInput = z.infer<typeof barbershopInfoSchema>;

// Parámetros de la URL de la agenda (?dia=2026-10-13&barbero=<uuid>). Un valor inválido se ignora
// (hoy / todos los barberos): nadie ve un error técnico por editar la URL.
const realLocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    // Descarta 2026-02-30 y 2026-13-01 (Date.parse da NaN en vez de lanzar, a diferencia de toISOString).
    const time = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === v;
  });

export const agendaParamsSchema = z.object({
  dia: realLocalDate.optional().catch(undefined),
  barbero: z.uuid().optional().catch(undefined),
});
