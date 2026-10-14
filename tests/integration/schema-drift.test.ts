import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { query } from "./helpers/db";

// src/lib/db/schema.ts está escrito a mano (ADR-017, enmienda 1): este test garantiza que coincide con
// la base real, creada solo por db/migrations/. Compara, en ambos sentidos, cada columna: nombre, tipo,
// NOT NULL y si tiene DEFAULT (spec 005, T023).

type Column = { type: string; notNull: boolean; hasDefault: boolean };

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));

/** Tipo comparable: sin espacios ("numeric(12, 2)" = "numeric(12,2)") y con `time` en su nombre completo. */
function normalizeType(type: string): string {
  const full = type === "time" ? "time without time zone" : type;
  return full.replace(/\s+/g, "");
}

async function databaseColumns(table: string): Promise<Record<string, Column>> {
  const rows = await query<{ name: string; type: string; not_null: boolean; has_default: boolean }>(
    `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
            a.attnotnull as not_null, a.atthasdef as has_default
       from pg_attribute a
      where a.attrelid = ('public.' || quote_ident($1))::regclass and a.attnum > 0 and not a.attisdropped`,
    [table],
  );
  return Object.fromEntries(
    rows.map((r) => [r.name, { type: normalizeType(r.type), notNull: r.not_null, hasDefault: r.has_default }]),
  );
}

function schemaColumns(table: PgTable): Record<string, Column> {
  return Object.fromEntries(
    getTableConfig(table).columns.map((c) => [
      c.name,
      { type: normalizeType(c.getSQLType()), notNull: c.notNull, hasDefault: c.hasDefault },
    ]),
  );
}

describe("src/lib/db/schema.ts coincide con la base", () => {
  it("describe las 7 tablas de negocio", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      "appointments",
      "barber_blocks",
      "barber_schedules",
      "barbers",
      "barbershops",
      "profiles",
      "services",
    ]);
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    "%s: mismas columnas, tipos, NOT NULL y DEFAULT",
    async (name, table) => {
      expect(schemaColumns(table)).toEqual(await databaseColumns(name));
    },
  );
});
