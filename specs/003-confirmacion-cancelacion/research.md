# Research: confirmación y cancelación

## 1. Token de cancelación

- **Generación**: `randomBytes(32).toString("base64url")`, de `node:crypto` → 43 caracteres `[A-Za-z0-9_-]`. 256 bits: no se puede adivinar por fuerza bruta, así que no hace falta rate limiting para el enlace.
- **Almacenamiento**: solo `sha256(token)` en `appointments.cancel_token_hash` (`bytea`, 32 bytes). Si la base se filtra, los hashes no sirven para cancelar. No hace falta sal: el token ya es aleatorio de 256 bits.
- **Paso por PostgREST**: los `bytea` se envían y comparan como texto hexadecimal `\x…` (`"\\x" + hash.toString("hex")`). Un helper único `hashToken(token): string` en `src/lib/cancellation/token.ts` devuelve ese formato, para insertar y para buscar.
- **Caducidad**: implícita, la hora de inicio (`starts_at > now()`). Así no hace falta una columna de expiración.
- **Un solo uso**: tras cancelar, la cita queda `cancelled` y el trigger existente impide reactivarla. El token sigue en la fila, pero ya no cancela nada.
- **Validación**: `z.string().regex(/^[A-Za-z0-9_-]{43}$/)`. Un formato inválido responde "Este enlace no es válido" sin consultar la base.

**Descartado**:
- **JWT firmado**: no se puede revocar y añade una clave más que gestionar.
- **Token en claro en la base**: si la base se filtra, permite cancelar cualquier cita.
- **Columna `expires_at`**: duplica `starts_at`.

## 2. GET muestra, POST cancela

Los escáneres de enlaces de los correos (Outlook Safe Links, antivirus) abren las URL. Si el GET cancelara, se cancelarían citas solas. Por eso:
- la página (Server Component) solo lee y muestra;
- el botón es un `<form method="post">` con una server action.

Es el mismo patrón que el formulario de reserva: `method="post"` para que no filtre datos antes de hidratar.

## 3. Cancelación atómica

Una sola sentencia con la clave secreta:

```ts
db.from("appointments")
  .update({ status: "cancelled", cancelled_at: now.toISOString() })
  .eq("barbershop_id", barbershop.id)
  .eq("cancel_token_hash", hash)
  .eq("status", "active")
  .gt("starts_at", now.toISOString())
  .select("id")
```

- **1 fila actualizada**: cancelada.
- **0 filas**: se lee la cita (barbería y hash) para distinguir:
  - no existe → `invalid`;
  - ya cancelada → `already_cancelled`;
  - ya pasó → `past`.

Dos clics simultáneos: Postgres bloquea la fila y la segunda sentencia vuelve a evaluar `status = 'active'`, así que actualiza 0 filas y responde `already_cancelled`. No hace falta candado propio.

## 4. Envío del correo sin cola

- **Cuándo**: con `after()` de `next/server` dentro de la server action `createBooking`, tras obtener el resultado. La respuesta al cliente no espera al envío.
  - Funciona en Vercel (`waitUntil`) y en Node propio (VPS), así que cumple la constitución VIII.
  - **Leer `node_modules/next/dist/docs/` sobre `after` antes de usarlo** (AGENTS.md).
- **Por qué no en `submitBooking`**: `after` exige el contexto de una petición de Next, y `submitBooking` se prueba sin Next. Por eso:
  - `submitBooking` devuelve `{ result, confirmation? }`;
  - `createBooking` programa el envío con `after` y devuelve solo `result` al navegador. El token nunca viaja al navegador.
- **Sin reintentos**: si Resend falla, se registra el error y la cita sigue (spec FR-002). Las colas con reintentos están en el Roadmap.

**Descartado**:
- **Enviar antes de responder**: suma ~300 ms a cada reserva y un fallo de Resend retrasaría la confirmación.
- **Cola con `pg_cron` o Supabase Queues**: está en el Roadmap y es sobreingeniería para el MVP.

## 5. Transporte del correo: sin dependencias nuevas

- **Resend** se llama con `fetch` a `POST https://api.resend.com/emails`:
  - cabecera `Authorization: Bearer <RESEND_API_KEY>`;
  - cuerpo `{ from, to, subject, html, text }`;
  - una respuesta no 2xx lanza un error con el código HTTP y el `name` del cuerpo, sin el cuerpo completo.

  El SDK `resend` no aporta nada para un solo envío.
- **Plantilla**: una función que devuelve `{ subject, html, text }`, con HTML simple con estilos en línea y escapando **todo** valor dinámico con `escapeHtml`. Así un nombre con `<script>` o `"` no rompe ni inyecta HTML.
  - React Email se deja para cuando haya más de una plantilla (recordatorios, versión 1.1). Hoy añadiría dos dependencias para un único correo, y la constitución VII pide justificar cada dependencia.
- **Selección del transporte**: variable `EMAIL_TRANSPORT`:
  - `outbox`: por defecto fuera de producción. Escribe `.outbox/<ISO-fecha>-<uuid>.json` con `{ to, subject, html, text }`. Prohibido si `NODE_ENV === "production"`: lanza error.
  - `resend`: por defecto en producción. Exige `RESEND_API_KEY` y `EMAIL_FROM`; si faltan, lanza error.
- **Por qué outbox en desarrollo**:
  - el E2E lee el correo de la carpeta y abre el enlace real;
  - Resend en modo de pruebas rechaza destinatarios distintos del dueño de la cuenta, y los tests usan `e2e-…@example.com`;
  - no gasta la cuota de Resend.
- **Probar el envío real**: el usuario pone `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` y `EMAIL_FROM="Reservas <onboarding@resend.dev>"` en `.env.local` y reserva con su propio correo.

## 6. URL del enlace

`cancelUrl(subdomain, token)` en `src/lib/cancellation/token.ts`:
- **Protocolo**: `http` si `ROOT_DOMAIN` empieza por `localhost` o contiene `.localhost`; si no, `https`.
- **URL**: `${protocol}://${subdomain}.${ROOT_DOMAIN}/cancelar/${token}`.

Nunca se usa el Host de la petición para construirla: evita la inyección de cabecera Host, que haría que el enlace apuntara a un dominio del atacante.

## 7. Página de cancelación

Ruta `src/app/s/[subdomain]/cancelar/[token]/page.tsx`. El proxy ya reescribe `/cancelar/...` del subdominio a `/s/<sub>/cancelar/...`; comprobar que no hace falta tocar `src/proxy.ts`.

- **`generateMetadata`**:
  - `robots: { index: false, follow: false }`;
  - `referrer: "no-referrer"` (verificar el nombre del campo en los docs de Metadata de Next 16).
- **Barbería**: con `getPublicBarbershop(subdomain)`; si no existe, `notFound()`.
- **Lectura**: `getCancellation(barbershop, token, now)` → estado:
  - `invalid`;
  - `active`, con datos;
  - `already_cancelled`;
  - `past`.

  Los datos mostrados salen de la cita (hora con `formatDateTime`, duración y precio copiados) más los nombres de servicio y barbero por FK, aunque estén inactivos.
- **Seguridad de la lectura**: la consulta de la página filtra por la barbería del parámetro `subdomain` de la ruta. Esto no rompe SEC-001, porque la ruta `/s/<sub>` solo se alcanza a través del Host vía proxy y la lectura no modifica nada. La server action, que sí modifica, resuelve la barbería con el Host.
