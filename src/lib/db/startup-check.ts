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
         -- Privilegios propios sobre tablas, por esquema. app_login es NOINHERIT (has_*_privilege no cuenta
         -- los de sus roles de trabajo); auth_login no tiene membresías (lo garantiza member_of).
         -- dbmate se busca por nombre (si falta, no hay nada que comprobar). extensions no entra: la
         -- extensión pg_stat_statements concede SELECT a PUBLIC sobre sus vistas (07_roles lo cubre en local).
         exists (select 1 from pg_class c
                  where c.relnamespace in (select oid from pg_namespace
                                            where nspname in ('public', 'private', 'dbmate'))
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

// Los roles de trabajo a los que cambia app_login (revisión spec 005, SEC-013). Si authenticated tuviera
// BYPASSRLS, fuera superusuario, dueño de objetos o miembro de otro rol (p. ej. `grant db_owner to
// authenticated`: heredaría ser dueño de las tablas), el panel se saltaría RLS. La matriz esperada es la
// de db/init/roles.sh y db/tests/07_roles.test.sql (§1): si cambia allí, cambia aquí.
type WorkRoleFacts = {
  role: string;
  superuser: boolean;
  bypassrls: boolean;
  owns_objects: boolean;
  member_of: string[];
};

const WORK_ROLES_SQL = `
  select r.rolname as role,
         r.rolsuper as superuser,
         r.rolbypassrls as bypassrls,
         exists (select 1 from pg_shdepend d
                  where d.refclassid = 'pg_authid'::regclass and d.refobjid = r.oid and d.deptype = 'o') as owns_objects,
         array(select m.roleid::regrole::text from pg_auth_members m where m.member = r.oid order by 1) as member_of
    from pg_roles r
   where r.rolname in ('authenticated', 'service_role')`;

/** BYPASSRLS esperado: solo service_role se salta RLS (web pública, siempre filtrando por el Host). */
const WORK_ROLE_BYPASSRLS: Record<string, boolean> = { authenticated: false, service_role: true };

/** Motivos por los que los roles de trabajo no son seguros (vacío si lo son). */
export function workRoleProblems(rows: WorkRoleFacts[]): string[] {
  const problems: string[] = [];
  for (const [role, bypassrls] of Object.entries(WORK_ROLE_BYPASSRLS)) {
    const f = rows.find((r) => r.role === role);
    if (!f) {
      problems.push(`no existe el rol de trabajo "${role}"`);
      continue;
    }
    if (f.superuser) problems.push(`"${role}" es superusuario`);
    if (f.bypassrls !== bypassrls) problems.push(`"${role}" ${bypassrls ? "debe tener" : "no debe tener"} BYPASSRLS`);
    if (f.owns_objects) problems.push(`"${role}" es dueño de objetos de la base`);
    if (f.member_of.length > 0) problems.push(`"${role}" es miembro de [${f.member_of.join(", ")}] y no debe serlo de ningún rol`);
  }
  return problems;
}

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
    ...workRoleProblems((await appPool().query<WorkRoleFacts>(WORK_ROLES_SQL)).rows),
  ];
  if (problems.length > 0) throw new Error(problems.join("; "));
}
