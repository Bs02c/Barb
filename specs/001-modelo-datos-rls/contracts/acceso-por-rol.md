# Contrato de acceso por rol (políticas RLS)

Quién puede hacer qué sobre cada tabla. "Propia" significa `barbershop_id = private.current_barbershop_id()`, que es null si la barbería del admin está desactivada (`is_active = false`): una barbería desactivada deja a sus admins sin acceso. Lo que no aparece está denegado por ausencia de política (constitución 1.1.1, principio I) y lo prueban los tests de `01_isolation`.

| Tabla | `anon` (sin sesión) | `admin` | `super_admin` | Servidor con clave secreta |
|---|---|---|---|---|
| `barbershops` | — | SELECT de la propia | SELECT, INSERT, UPDATE, DELETE de todas | Todo (salta RLS) |
| `profiles` | — | SELECT de su propio perfil | SELECT de todos | Todo |
| `barbers` | — | SELECT, INSERT, UPDATE, DELETE de la propia | — | Todo |
| `services` | — | SELECT, INSERT, UPDATE, DELETE de la propia | — | Todo |
| `barber_schedules` | — | SELECT, INSERT, UPDATE, DELETE de la propia | — | Todo |
| `barber_blocks` | — | SELECT, INSERT, UPDATE, DELETE de la propia | — | Todo |
| `appointments` | — | SELECT de la propia; UPDATE solo de `status` y `cancelled_at` | — | Todo |

## Notas

- **`authenticated`**: sin TRUNCATE, TRIGGER ni REFERENCES en ninguna tabla (TRUNCATE salta RLS).
- **Registro público desactivado**: no hay alta de usuarios por cuenta propia; las cuentas las crea el super admin.
- **`anon`**: además de no tener políticas, se le revocan todos los privilegios de tabla. La web pública (fases 4 y 5) usa server actions con la clave secreta, que siempre filtran por el `barbershop_id` resuelto del subdominio (constitución, principio I).
- **Nadie con sesión puede cambiar perfiles**: ni un admin puede subirse a super admin ni cambiar de barbería. Los perfiles los crea el super admin con el script de alta (fase 3) o el `seed.sql`, ambos con permisos de servidor.
- **Citas del admin**: puede verlas y cancelarlas (fase 6), cambiando solo `status` y `cancelled_at` (permiso por columnas). No puede crearlas, borrarlas ni modificar el consentimiento, el precio, el horario ni los datos del cliente. Las crea la reserva pública desde el servidor. Una cita cancelada se conserva y un trigger impide reactivarla, para cualquier rol.
- **Alta de admins**: el script de alta de barberías se hace en la fase 3; hasta entonces, `seed.sql` en local.
- **`super_admin`** gestiona barberías y no ve barberos, servicios ni citas: mínimo privilegio.
- Toda política de INSERT y UPDATE usa `with check` con la misma condición que `using`, para que no se pueda mover un registro a otra barbería.

## Para la aplicación (agente principal y `frontend`)

- Tipos TypeScript: `src/lib/database.types.ts`, generado con `npm run db:types`.
- Leer como admin: cliente de Supabase con la sesión del usuario (`@supabase/ssr`). RLS filtra solo.
- Escribir desde la web pública: solo en el servidor, con la clave secreta y filtrando por barbería.
- Errores que la aplicación debe traducir:

| Caso | SQLSTATE | Restricción | Mensaje para el usuario |
|---|---|---|---|
| Cita solapada | `23P01` | `appointments_no_overlap` | "Ese horario ya no está disponible" |
| Tramo de horario solapado | `23P01` | `barber_schedules_no_overlap` | "Ese tramo se cruza con otro del mismo día" |
| Reactivar una cita cancelada | `23514` | `appointments_status_transition` | "Una cita cancelada no puede reactivarse" |
| Borrar barbero o servicio con citas | `23503` | `appointments_barber_fkey` / `appointments_service_fkey` | "Tiene citas: desactívalo en lugar de borrarlo" |
| Subdominio repetido | `23505` | — | "Ese subdominio ya está en uso" |
| Formato o rango inválido | `23514` | nombre del `check` | según el campo |
| Sin permiso (RLS o columna no permitida) | `42501` | — | error genérico; no debería ocurrir desde la interfaz |

- Cancelar una cita como admin: `update ... set status = 'cancelled', cancelled_at = now()` (los dos campos juntos).
- Tras el login, si el admin no obtiene su barbería, mostrar "barbería desactivada" en lugar de un panel vacío.
- Registro público desactivado (`signup_disabled`); contraseña mínima de 8 caracteres.
