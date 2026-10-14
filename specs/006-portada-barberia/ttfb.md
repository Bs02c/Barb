# TTFB: portada (spec 006, SC-005)

Script: `npm run perf:ttfb` (`scripts/measure-ttfb.mjs`): 30 peticiones secuenciales tras 5 de calentamiento, contra `npm run build && npm run start` en local. Se hacen dos ejecuciones seguidas.

## Antes (2026-10-14, commit `7ea8fc1`, portada anterior)

| Ruta | Ejecución | Mediana (ms) | p90 (ms) |
|---|---|---|---|
| `/` | 1 | 22.5 | 29.0 |
| `/` | 2 | 18.5 | 30.4 |
| `/reservar` | 1 | 17.1 | 19.2 |
| `/reservar` | 2 | 20.2 | 24.9 |
| `/admin` | 1 | 29.2 | 56.8 |
| `/admin` | 2 | 29.7 | 37.7 |

Media de las medianas: `/` 20.5 ms, `/reservar` 18.7 ms, `/admin` 29.5 ms.

## Después (2026-10-14, portada nueva, rama `006-portada-barberia` sin commit de cierre)

| Ruta | Ejecución | Mediana (ms) | p90 (ms) |
|---|---|---|---|
| `/` | 1 | 20.1 | 22.3 |
| `/` | 2 | 19.8 | 28.2 |
| `/reservar` | 1 | 19.3 | 22.2 |
| `/reservar` | 2 | 19.1 | 20.7 |
| `/admin` | 1 | 28.1 | 32.1 |
| `/admin` | 2 | 28.1 | 31.3 |

Media de las medianas: `/` 20.0 ms, `/reservar` 19.2 ms, `/admin` 28.1 ms.

**SC-005 (la portada no supera en más de un 10 % a `/reservar`): cumple**, con un +4 %. La portada hace las mismas dos transacciones que el paso 1 de la reserva (barbería y catálogo). La lectura de los tramos semanales sustituyó al `EXISTS`, así que no añade consultas. Frente a la portada anterior (20.5 ms), no cambia.
