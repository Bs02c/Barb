-- Tope de citas activas futuras por número de teléfono y barbería, aplicado en la base de datos.
--
-- Motivo: book.ts cuenta y luego inserta (dos pasos). Con reservas simultáneas del mismo número
-- todas ven 0 citas y se guardan todas (research §4 revisado, 2026-10-06). El trigger se pone en
-- fila por (barbería, número) con un candado de transacción, cuenta y rechaza la tercera.
-- El candado se libera al terminar la transacción. La función es VOLATILE (por defecto) para que
-- el count tome una instantánea nueva tras el candado y vea lo que la otra transacción confirmó.
--
-- El 2 debe coincidir con MAX_ACTIVE_PER_PHONE en src/lib/booking/book.ts: cambiar ambos a la vez.
-- Error: SQLSTATE 23514 (check_violation), constraint appointments_phone_limit.
create function private.appointments_enforce_phone_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.starts_at > now() then
    perform pg_advisory_xact_lock(
      hashtextextended(new.barbershop_id::text || ':' || new.customer_phone, 0));

    if (select count(*)
          from public.appointments a
         where a.barbershop_id = new.barbershop_id
           and a.customer_phone = new.customer_phone
           and a.status = 'active'
           and a.starts_at > now()) >= 2 then
      raise exception 'tope de citas activas por número (appointments_phone_limit)'
        using errcode = 'check_violation',
              constraint = 'appointments_phone_limit';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.appointments_enforce_phone_limit() from public, anon;

create trigger appointments_phone_limit
  before insert on public.appointments
  for each row
  execute function private.appointments_enforce_phone_limit();
