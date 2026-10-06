# Modelo de datos: confirmación y cancelación

## Cambio de esquema (agente `database`)

Migración nueva `appointments_cancel_token`:

```sql
alter table public.appointments
  add column cancel_token_hash bytea
    constraint appointments_cancel_token_hash_length check (octet_length(cancel_token_hash) = 32);

create unique index appointments_cancel_token_hash_key
  on public.appointments (cancel_token_hash)
  where cancel_token_hash is not null;
```

- **Opcional (null)**: el seed y las citas anteriores no tienen token. Las citas nuevas desde la web siempre lo llevan; lo garantiza `book.ts`, que lo prueba el test de integración.
- **Índice único parcial**: la búsqueda por hash es directa y una colisión (imposible en la práctica) fallaría en lugar de cancelar otra cita.
- **Permisos**: sin cambios.
  - `authenticated` sigue pudiendo actualizar solo `status` y `cancelled_at` (SEC-001 de la fase 1): no puede escribir el hash.
  - Puede leerlo con RLS de su barbería, lo cual es inofensivo: el hash no sirve para cancelar. Se documenta en el comentario de la migración.
  - `anon` no tiene acceso.
- **Comentario en la columna**: "SHA-256 del token de cancelación del enlace del correo. El token en claro nunca se guarda (spec 003, FR-003)."
- Tras la migración: `npm run db:types`.

## Sin cambios

- **Cancelar**: es el `UPDATE` de `status` y `cancelled_at` que ya existe.
- **Trigger** `appointments_prevent_reactivation`: garantiza el "un solo uso".
- **Exclusión** `appointments_no_overlap`: ya ignora las canceladas, así que la hora queda libre al cancelar.
