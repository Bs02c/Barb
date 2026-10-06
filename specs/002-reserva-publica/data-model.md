# Modelo de datos: fase 4

**Sin cambios en la base de datos.** Se usan las tablas de la fase 1 (`barbershops`, `barbers`, `services`, `barber_schedules`, `barber_blocks`, `appointments`) con la clave secreta desde el servidor.

## Tipos de la aplicación (no persistidos)

### TimeRange
`{ start: Date; end: Date }`: intervalo semiabierto `[start, end)` en UTC.

### AvailabilityInput (entrada de `computeAvailableSlots`)
| Campo | Tipo | Notas |
|---|---|---|
| `timezone` | string | zona IANA de la barbería |
| `now` | Date | inyectado (los tests fijan "ahora") |
| `fromDate`, `days` | string `YYYY-MM-DD`, number | días locales a calcular (por defecto hoy y 30) |
| `durationMinutes` | number | del servicio |
| `barbers` | `{ id, name }[]` | barberos activos candidatos (uno o todos con "pronto") |
| `schedules` | `{ barberId, weekday, startTime, endTime }[]` | hora local, día ISO |
| `blocks` | `{ barberId, range: TimeRange }[]` | |
| `appointments` | `{ barberId, range: TimeRange }[]` | solo activas |
| `stepMinutes` | 15 | constante |
| `minLeadMinutes` | 60 | constante |
| `horizonDays` | 30 | constante |

### AvailableSlot (salida)
| Campo | Tipo | Notas |
|---|---|---|
| `startsAt` | string ISO UTC | lo que viaja en la URL y en el formulario |
| `localDate` | `YYYY-MM-DD` | día local, para agrupar |
| `label` | string | "9:15 a. m." (es-CO, hora local) |
| `barberId` | uuid | barbero que se asignaría (en "pronto", según la regla de reparto) |

### BookingInput (formulario del paso 4, Zod)
| Campo | Regla |
|---|---|
| `service_id` | uuid |
| `barber_id` | uuid o `"pronto"` |
| `starts_at` | ISO UTC |
| `customer_name` | 1–100 caracteres |
| `customer_phone` | normalizado a E.164 (research §5) |
| `customer_email` | correo válido, ≤ 254 |
| `consent` | debe ser `"on"` |
| `website` | honeypot: debe llegar vacío |

### BookingResult
- `ok: true` + `summary { serviceName, barberName, startsAtLabel, durationMinutes, priceLabel }`
- `ok: false` + `message` + `fieldErrors?` + `code?` (`"slot_taken"`, `"limit_reached"`, `"invalid"`, `"unavailable"`)
