# TTFB: reserva mejorada (spec 007)

`npm run perf:ttfb` contra `npm run build && npm run start` en local, el 2026-10-14: 30 peticiones secuenciales tras 5 de calentamiento, en dos ejecuciones seguidas. Desde esta spec, el script mide también el paso 3 (fecha y hora elegidas, con la barra) y el paso 4 (`datos=1`), siguiendo la revisión de rendimiento (PERF-002). Además, corrige que antes no enviaba los parámetros de la URL.

| Ruta | Ejecución | Mediana (ms) | p90 (ms) |
|---|---|---|---|
| `/` | 1 | 20.8 | 23.0 |
| `/` | 2 | 20.7 | 25.8 |
| `/reservar` (paso 1) | 1 | 19.3 | 20.6 |
| `/reservar` (paso 1) | 2 | 21.5 | 24.7 |
| `/reservar` paso 3 (fecha y hora) | 1 | 41.7 | 58.5 |
| `/reservar` paso 3 (fecha y hora) | 2 | 29.5 | 43.7 |
| `/reservar` paso 4 (datos) | 1 | 38.9 | 49.7 |
| `/reservar` paso 4 (datos) | 2 | 26.0 | 28.2 |
| `/admin` | 1 | 36.4 | 40.4 |
| `/admin` | 2 | 24.3 | 26.8 |

- **Pasos 3 y 4:** calculan la disponibilidad de 30 días (`getAvailability`), así que cuestan entre 26 y 42 ms, frente a unos 20 ms del paso 1. Es la primera medición de estos pasos, de modo que no hay "antes" con qué comparar. Queda como referencia para la fase B.
- **Resto de rutas:** `/`, el paso 1 y `/admin` siguen en los valores de la spec 006.
- **Variación entre ejecuciones:** la primera fue más lenta en todas las rutas dinámicas, por la carga de la máquina, con poca memoria libre.
