-- Limpieza periódica del esquema identity (ADR-017 §5; revisión spec 005, SEC-008 y PERF-002).
-- Se ejecuta como db_owner en la tarea programada de los respaldos (fase 7), sin pg_cron (constitución VIII):
--   psql -v ON_ERROR_STOP=1 -d barberias -f db/maintenance/cleanup.sql
-- Por qué: Better Auth solo borra una sesión caducada cuando alguien la vuelve a presentar, y la tabla
-- del límite de intentos guarda una fila por IP y ruta sin caducidad. Sin limpieza crecen sin límite
-- con IP y user-agent (datos personales, Ley 1581) y con tokens viejos que irían en cada respaldo.

begin;

-- Sesiones caducadas hace más de un día (el margen evita borrar una que se esté usando justo ahora).
delete from identity.session where "expiresAt" < now() - interval '1 day';

-- Tokens de verificación caducados (el MVP no los usa, pero Better Auth puede crearlos).
delete from identity.verification where "expiresAt" < now() - interval '1 day';

-- Contadores del límite de intentos sin actividad en el último día ("lastRequest" en milisegundos).
-- La ventana más larga configurada es de 15 minutos: un día de margen no afecta a ningún bloqueo vigente.
delete from identity."rateLimit"
 where "lastRequest" < (extract(epoch from now() - interval '1 day') * 1000)::bigint;

commit;
