import "server-only";
import type { Pool } from "pg";
import { appPool, authPool } from "./pool";

// Comprobación de roles al arrancar (constitución I 1.2.0; spec 005, FR-014 y research §10).
// El aislamiento del panel depende SOLO de RLS: si la app se conectara como superusuario, como dueño de
// las tablas o con un rol con BYPASSRLS, RLS no se aplicaría y un admin vería otras barberías. Por eso
// la app se niega a arrancar si su rol tiene de más, o si no puede comprobarlo.

type RoleFacts = {
  user: string;
  superuser: boolean;
  bypassrls: boolean;
  owns_objects: boolean;
  inheriting_memberships: number;
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
         (select count(*)::int from pg_auth_members m where m.member = r.oid and m.inherit_option) as inheriting_memberships
    from pg_roles r
   where r.rolname = current_user`;

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
