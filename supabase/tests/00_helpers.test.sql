-- T006: comprobaciones de estructura sobre el catálogo (MAINT-003, SEC-003).
-- Recorre TODAS las tablas de public (relkind 'r'), así una tabla nueva queda cubierta sin tocar
-- este archivo: RLS activo, anon sin ningún privilegio y authenticated sin TRUNCATE, TRIGGER ni
-- REFERENCES (RLS no cubre TRUNCATE). Además, funciones auxiliares fuera del alcance de anon.
begin;
create extension if not exists pgtap with schema extensions;

select no_plan();

-- Salvaguarda: el recorrido del catálogo no está vacío (las siete tablas de la fase 1 como mínimo).
select ok(
  (select count(*) >= 7 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'el catálogo de public tiene al menos las 7 tablas de la fase 1'
);

-- RLS activado en todas las tablas de public
select ok(c.relrowsecurity, format('RLS activo en %s', c.relname))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- anon no tiene ningún privilegio de tabla
select table_privs_are('public', c.relname, 'anon', array[]::text[], format('anon sin privilegios en %s', c.relname))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- authenticated sin TRUNCATE, TRIGGER ni REFERENCES
select ok(
  not has_table_privilege('authenticated', c.oid, 'TRUNCATE')
  and not has_table_privilege('authenticated', c.oid, 'TRIGGER')
  and not has_table_privilege('authenticated', c.oid, 'REFERENCES'),
  format('authenticated sin TRUNCATE, TRIGGER ni REFERENCES en %s', c.relname)
)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- appointments: con sesión solo se actualizan status y cancelled_at (SEC-001)
select ok(
  not has_table_privilege('authenticated', 'public.appointments', 'UPDATE'),
  'authenticated sin UPDATE de tabla completa en appointments'
);
select is(
  (select array_agg(a.attname::text order by a.attname::text)
   from pg_attribute a
   where a.attrelid = 'public.appointments'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['cancelled_at', 'status'],
  'authenticated solo puede actualizar appointments.status y appointments.cancelled_at'
);

-- Funciones auxiliares: anon no puede ejecutarlas
select ok(
  not has_function_privilege('anon', 'private.current_barbershop_id()', 'execute'),
  'anon no ejecuta private.current_barbershop_id()'
);
select ok(
  not has_function_privilege('anon', 'private.is_super_admin()', 'execute'),
  'anon no ejecuta private.is_super_admin()'
);
select ok(
  not has_function_privilege('anon', 'private.is_valid_timezone(text)', 'execute'),
  'anon no ejecuta private.is_valid_timezone(text)'
);

-- Las funciones security definer fijan search_path
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in ('private.current_barbershop_id()'::regprocedure, 'private.is_super_admin()'::regprocedure)),
  'funciones security definer con search_path vacío'
);
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.appointments_prevent_reactivation()'::regprocedure),
  'función del trigger de citas: security invoker y search_path vacío'
);

select * from finish();
rollback;
