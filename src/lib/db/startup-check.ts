import "server-only";
import type { Pool } from "pg";
import { appPool, authPool } from "./pool";

// Comprobación de roles al arrancar (constitución I 1.2.0; spec 005, FR-010, FR-014 y research §10).
// El aislamiento del panel depende SOLO de RLS: si la app se conectara como superusuario, como dueño de
// las tablas, con un rol con BYPASSRLS, con privilegios propios o pudiendo cambiar a un rol que los
// tenga, RLS no se aplicaría y un admin vería otras barberías. En pruebas y producción esta es la única
// barrera ante una mala configuración (los tests pgTAP solo corren en local), así que la app se niega a
// arrancar si su rol tiene de más, o si no puede comprobarlo (revisión spec 005, SEC-001).

type RoleFacts = {
  user: string;
  superuser: boolean;
  bypassrls: boolean;
  owns_objects: boolean;
  inheriting_memberships: number;
  admin_memberships: number;
  member_of: string[];
  business_privileges: boolean;
  identity_privileges: boolean;
};

const FACTS_SQL = `
  select current_user as user,
         r.rolsuper as superuser,
         r.rolbypassrls as bypassrls,
         exists (select 1 from pg_class where relowner = r.oid
                 union all select 1 from pg_proc where proowner = r.oid
                 union all select 1 from pg_namespace where nspowner = r.oid
                 union all select 1 from pg_type where typowner = r.oid
                 union all select 1 from pg_database where datdba = r.oid) as owns_objects,
         (select count(*)::int from pg_auth_members m where m.member = r.oid and m.inherit_option) as inheriting_memberships,
         (select count(*)::int from pg_auth_members m where m.member = r.oid and m.admin_option) as admin_memberships,
         array(select m.roleid::regrole::text from pg_auth_members m where m.member = r.oid order by 1) as member_of,
         -- Privilegios propios sobre tablas, por esquema (los roles son NOINHERIT: has_*_privilege no
         -- cuenta los de sus roles de trabajo).
         exists (select 1 from pg_class c
                  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
                    and c.relkind in ('r', 'v', 'm', 'p')
                    and (has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                         or has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))) as business_privileges,
         exists (select 1 from pg_class c
                  where c.relnamespace = 'identity'::regnamespace
                    and c.relkind in ('r', 'v', 'm', 'p')
                    and (has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                         or has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))) as identity_privileges
    from pg_roles r
   where r.rolname = current_user`;

/**
 * Lo que cada conexión puede hacer, exactamente (data-model.md §Roles): a qué roles puede cambiar
 * (cambio de rol por transacción) y si puede tener privilegios propios en el esquema identity (solo Better Auth).
 */
const EXPECTED: Record<string, { memberOf: string[]; identityPrivileges: boolean }> = {
  app_login: { memberOf: ["authenticated", "service_role"], identityPrivileges: false },
  auth_login: { memberOf: [], identityPrivileges: true },
};

async function facts(pool: Pool): Promise<RoleFacts> {
  const { rows } = await pool.query<RoleFacts>(FACTS_SQL);
  return rows[0];
}

/** Motivos por los que un rol de conexión no es seguro (vacío si lo es). */
export function roleProblems(f: RoleFacts, expectedUser: string): string[] {
  const problems: string[] = [];
  if (f.user !== expectedUser) problems.push(`se conecta como "${f.user}" y debe ser "${expectedUser}"`);
  if (f.superuser) problems.push(`"${f.user}" es superusuario`);
  if (f.bypassrls) problems.push(`"${f.user}" tiene BYPASSRLS`);
  if (f.owns_objects) problems.push(`"${f.user}" es dueño de objetos de la base`);
  if (f.inheriting_memberships > 0) problems.push(`"${f.user}" hereda privilegios de otro rol (membresía sin INHERIT FALSE)`);
  if (f.admin_memberships > 0) problems.push(`"${f.user}" puede administrar membresías de otro rol (ADMIN OPTION)`);
  const expected = EXPECTED[expectedUser] ?? { memberOf: [], identityPrivileges: false };
  if (f.member_of.join(",") !== expected.memberOf.join(",")) {
    problems.push(`"${f.user}" puede cambiar a [${f.member_of.join(", ")}] y solo debe poder cambiar a [${expected.memberOf.join(", ")}]`);
  }
  if (f.business_privileges) problems.push(`"${f.user}" tiene privilegios propios sobre tablas de negocio (solo deben tenerlos sus roles de trabajo)`);
  if (f.identity_privileges && !expected.identityPrivileges) problems.push(`"${f.user}" tiene privilegios propios sobre las tablas del login (identity)`);
  return problems;
}

/** Lanza un error con todos los motivos si algún rol de conexión no es seguro. */
export async function assertSafeRoles(): Promise<void> {
  const problems = [
    ...roleProblems(await facts(appPool()), "app_login"),
    ...roleProblems(await facts(authPool()), "auth_login"),
  ];
  if (problems.length > 0) throw new Error(problems.join("; "));
}
