# TTFB de `/reservar` y `/admin` (spec 005, FR-023 y SC-005)

Medido con `npm run perf:ttfb` (`scripts/measure-ttfb.mjs`) contra `npm run build && npm run start`:
- 30 peticiones secuenciales tras 5 de calentamiento;
- `/admin` con la sesión del admin de demostración de `labarberia`.

Misma máquina (Windows 11, proyecto en OneDrive), con la app y la base en local. Por la variación entre ejecuciones (ver "Antes"), la comparación usa la media de dos ejecuciones.

## Antes (Supabase local, 2026-10-13, commit `372d84a`)

| Ruta | Ejecución | Mediana (ms) | p90 (ms) |
|---|---|---|---|
| `/reservar` | 1 | 20.0 | 28.5 |
| `/reservar` | 2 | 20.5 | 27.3 |
| `/admin` | 1 | 79.2 | 91.1 |
| `/admin` | 2 | 97.3 | 107.7 |

Referencia (media de las medianas): `/reservar` ≈ 20.3 ms y `/admin` ≈ 88.3 ms.

## Después (PostgreSQL propio, 2026-10-13, rama `005-migracion-postgresql` tras quitar Supabase)

| Ruta | Ejecución | Mediana (ms) | p90 (ms) |
|---|---|---|---|
| `/reservar` | 1 | 21.5 | 23.5 |
| `/reservar` | 2 | 14.3 | 15.9 |
| `/admin` | 1 | 29.0 | 34.5 |
| `/admin` | 2 | 26.8 | 29.0 |

## Comparación (media de las medianas)

| Ruta | Antes | Después | Cambio |
|---|---|---|---|
| `/reservar` | 20.3 ms | 17.9 ms | −12 % |
| `/admin` | 88.3 ms | 27.9 ms | −68 % |

SC-005 (no empeorar más de un 10 %): **cumple**. El panel mejora mucho porque antes cada petición pasaba por GoTrue (validar la sesión) y por PostgREST (cada consulta por HTTP). Ahora la sesión se verifica con una consulta y los datos van por una conexión directa, con el perfil y la barbería en una sola consulta. Es una medición local; en el VPS se suma la latencia de red Colombia→Alemania, igual para ambos casos.
