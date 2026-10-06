-- Spec 003: token de cancelación de la cita.
-- Solo se guarda el hash; el token en claro nunca se almacena (FR-003).
alter table public.appointments
  add column cancel_token_hash bytea
    constraint appointments_cancel_token_hash_length check (octet_length(cancel_token_hash) = 32);

create unique index appointments_cancel_token_hash_key
  on public.appointments (cancel_token_hash)
  where cancel_token_hash is not null;

comment on column public.appointments.cancel_token_hash is
  'SHA-256 (32 bytes) del token de cancelación enviado por correo. El token en claro nunca se guarda (spec 003 FR-003). Null en citas sin token (seed y anteriores).';

-- Permisos: sin cambios. authenticated solo puede actualizar status y cancelled_at (no puede
-- escribir el hash); puede leerlo por RLS de su barbería, lo cual es inofensivo porque es un hash
-- de un token aleatorio de alta entropía. anon no tiene acceso a la tabla.
comment on table public.appointments is
  'Citas. Permisos de columna: authenticated actualiza solo status y cancelled_at; cancel_token_hash solo lo escribe el backend con la clave de servicio.';
