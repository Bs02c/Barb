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

## Después (PostgreSQL propio)

Pendiente (T048).
