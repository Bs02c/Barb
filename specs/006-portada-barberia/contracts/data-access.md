# Contrato: capa de servidor (agente principal) ↔ páginas (agente `frontend`)

Las páginas solo importan estas funciones y tipos. No escriben consultas ni importan `src/lib/db/`.

## Portada (web pública)

### `getPublicBarbershop(subdomain)` (`src/lib/barbershops.ts`, ya existe)

Amplía `PublicBarbershop`:

```ts
type PublicBarbershop = {
  id: string; name: string; subdomain: string; timezone: string;
  description: string | null; // nuevo
  address: string | null;     // nuevo
};
```

### `getBookingCatalog(barbershop)` (`src/lib/booking/queries.ts`, ya existe)

Amplía lo que devuelve. El uso actual en la reserva no cambia:

```ts
type CatalogService = {
  id: string; name: string; durationMinutes: number; price: number; priceLabel: string;
  description: string | null; // nuevo
};
// devuelve además:
weeklyHours: DayHours[]; // siempre 7 elementos, lunes (1) a domingo (7)
```

### `src/lib/storefront/hours.ts` (nuevo, puro)

```ts
type DayHours = {
  weekday: number;            // 1 = lunes … 7 = domingo (ISO)
  label: string;              // "Lunes"
  open: string | null;        // "HH:MM" en hora local, o null si cerrado
  close: string | null;
  openLabel: string | null;   // "9:00 a. m." (formatTimeOfDay)
  closeLabel: string | null;
};

type OpeningStatus =
  | { kind: "open"; text: string }        // "Abierto ahora · hasta 7:00 p. m."
  | { kind: "opensToday"; text: string }  // "Abre hoy a las 9:00 a. m."
  | { kind: "closed"; text: string };     // "Cerrado ahora · Abre mañana a las 9:00 a. m." | "Cerrado ahora"

function weeklyHours(slots: { weekday: number; startTime: string; endTime: string }[]): DayHours[];
function openingStatus(hours: DayHours[], now: Date, timezone: string): OpeningStatus;
function todayWeekday(now: Date, timezone: string): number; // para resaltar el día
function mapsSearchUrl(address: string): string;            // R5
```

Los textos salen de aquí, no de los componentes: así se prueban con Vitest. `kind` decide el color: `open` en `success`; `opensToday` y `closed` en `muted-foreground`.

### Enlaces

- **"Reservar" de un servicio:** `/reservar?servicio=<id>`. Ya existe y abre el paso 2.
- **"Reservar lo más pronto":** `/reservar` (paso 1).
- **"Política de tratamiento de datos":** `/privacidad`. Se mantiene en el pie de la portada.

## Panel: "Mi barbería"

### `getBarbershopInfo()` (`src/lib/admin/queries.ts`, nuevo)

```ts
type BarbershopInfo = { name: string; description: string | null; address: string | null };
```

Con `withAdmin` y la sesión del admin.

### `updateBarbershopInfo(subdomain, prev, formData)` (`src/lib/admin/actions.ts`, nuevo)

- `formData`: `description`, `address` (texto; vacío = quitar).
- Devuelve `ActionState`:
  - éxito: `{ ok: true, message: "Datos guardados." }`;
  - error de validación: `fieldErrors` por campo;
  - 0 filas o `42501`: "No tienes permiso para hacer esto.".
- Uso: `useActionState(updateBarbershopInfo.bind(null, subdomain), initialState)`, igual que las demás.
- Revalida `/admin/mi-barberia` y la portada.

### Esquemas (`src/lib/admin/schemas.ts`)

- `barbershopInfoSchema`: `description` (opcional, ≤ 160) y `address` (opcional, ≤ 200), con `trim`, `''` → `null` y sin saltos de línea. Mensajes: "Máximo 160 caracteres." y "Máximo 200 caracteres.".
- Constantes exportadas `DESCRIPTION_MAX = 160`, `ADDRESS_MAX = 200` y `SERVICE_DESCRIPTION_MAX = 200`, para el `maxLength` y el contador de los campos.
- `serviceSchema` gana `description` (opcional, ≤ 200, mismas reglas). `createService` y `updateService` la guardan; `listServices` la devuelve (`Service.description: string | null`).
