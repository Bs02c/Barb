# Secretos de los roles de la base

Cada rol con sesión lee su contraseña de un archivo `db/init/secrets/<nombre>` (ignorado por git).
En el contenedor aparecen como `/run/secrets/<nombre>`. Este directorio solo documenta los nombres;
no contiene valores.

| Archivo | Rol |
|---|---|
| `postgres_password` | `postgres` (superusuario; solo inicialización) |
| `db_owner_password` | `db_owner` (dueño; migraciones, alta de barberías, seed local) |
| `app_login_password` | `app_login` (pool de la app) |
| `auth_login_password` | `auth_login` (pool de Better Auth) |
| `db_backup_password` | `db_backup` (respaldos con `pg_dump`) |

Generar cada archivo con un valor aleatorio, sin salto de línea final:

```bash
mkdir -p db/init/secrets
for n in postgres db_owner app_login auth_login db_backup; do
  node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))" > "db/init/secrets/${n}_password"
done
```

En un servidor, los archivos pertenecen al usuario que ejecuta Docker, con permisos `600`.
`roles.sh` se puede volver a ejecutar a mano para rotar contraseñas (cambia el archivo y ejecútalo).
