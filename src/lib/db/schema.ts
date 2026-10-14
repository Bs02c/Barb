import "server-only";
import { boolean, customType, integer, numeric, pgEnum, pgTable, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

// Escrito a mano (ADR-017, enmienda 1): `drizzle-kit pull` genera un archivo que no compila (bytea) y
// cruza las columnas de las FK compuestas (spec 005, research §3).
// El SQL de db/migrations/ es la ÚNICA fuente de verdad del esquema. Este archivo solo describe columnas
// y tipos para que las consultas estén tipadas: sin FK, check, índices ni políticas, a propósito.
// tests/integration/schema-drift.test.ts falla si una columna difiere de la base (nombre, tipo, nulabilidad).
// Los `.default…()` solo marcan qué columnas tienen DEFAULT en SQL (las vuelve opcionales al insertar);
// el valor real lo pone la base. El test de deriva comprueba que existan DEFAULT en las mismas columnas
// (no su valor) y que los enums tengan los mismos valores.
// Tras cada migración que toque estas tablas, actualizar este archivo y pasar ese test.

/** `bytea` como Buffer (hash SHA-256 del token de cancelación). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** `timestamptz` como Date: la capa de consultas lo convierte a ISO donde la app espera texto. */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const userRole = pgEnum("user_role", ["super_admin", "admin"]);
export const appointmentStatus = pgEnum("appointment_status", ["active", "cancelled"]);

export const barbershops = pgTable("barbershops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull(),
  timezone: text("timezone").notNull().default("America/Bogota"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"), // pública; null = sin dato (spec 006)
  address: text("address"), // pública; null = sin dato (spec 006)
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  role: userRole("role").notNull(),
  barbershopId: uuid("barbershop_id"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const barbers = pgTable("barbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  barbershopId: uuid("barbershop_id").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  barbershopId: uuid("barbershop_id").notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(), // texto: convertir con Number()
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"), // pública; null = sin dato (spec 006)
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/** Tramos del horario semanal en hora LOCAL de la barbería ("HH:MM:SS"). */
export const barberSchedules = pgTable("barber_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  barbershopId: uuid("barbershop_id").notNull(),
  barberId: uuid("barber_id").notNull(),
  weekday: smallint("weekday").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const barberBlocks = pgTable("barber_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  barbershopId: uuid("barbershop_id").notNull(),
  barberId: uuid("barber_id").notNull(),
  startsAt: timestamptz("starts_at").notNull(),
  endsAt: timestamptz("ends_at").notNull(),
  reason: text("reason"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  barbershopId: uuid("barbershop_id").notNull(),
  barberId: uuid("barber_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  startsAt: timestamptz("starts_at").notNull(),
  endsAt: timestamptz("ends_at").notNull(),
  serviceDurationMinutes: integer("service_duration_minutes").notNull(),
  servicePrice: numeric("service_price", { precision: 12, scale: 2 }).notNull(),
  status: appointmentStatus("status").notNull().default("active"),
  cancelledAt: timestamptz("cancelled_at"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email").notNull(),
  dataConsentAt: timestamptz("data_consent_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  cancelTokenHash: bytea("cancel_token_hash"),
});
