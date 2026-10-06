# Contrato: confirmación y cancelación

El agente principal publica estas firmas antes de lanzar al `frontend`. Todo módulo de `src/lib/` lleva `import "server-only"` salvo los marcados.

## `src/lib/cancellation/token.ts` (server-only)

```ts
export function generateCancelToken(): string;     // 43 caracteres base64url
export function hashToken(token: string): string;  // "\\x" + sha256 en hex, formato bytea de PostgREST
export function cancelUrl(subdomain: string, token: string): string; // research §6
```

## `src/lib/cancellation/schemas.ts` (sin server-only: compartido)

```ts
export const cancelTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
```

## `src/lib/cancellation/cancellation-state.ts` (sin server-only)

```ts
export type CancellationDetails = {
  serviceName: string;
  barberName: string;
  startsAtLabel: string;   // formatDateTime en la zona de la barbería
  durationMinutes: number;
  priceLabel: string;
};

export type CancellationView =
  | { status: "active"; details: CancellationDetails }
  | { status: "already_cancelled"; details: CancellationDetails }
  | { status: "past"; details: CancellationDetails }
  | { status: "invalid" };

export type CancelResult =
  | { ok: true }
  | { ok: false; code: "already_cancelled" | "past" | "invalid" | "server_error"; message: string };

export const initialCancelState: CancelResult | null = null;
```

## `src/lib/cancellation/queries.ts` (server-only)

```ts
/** Lectura para la página. Token con formato inválido → { status: "invalid" } sin consultar. */
export function getCancellation(
  barbershop: PublicBarbershop,
  token: string,
  now?: Date,
): Promise<CancellationView>;
```

## `src/lib/cancellation/cancel.ts` (server-only)

```ts
/** Resuelve la barbería del host, valida el token y cancela de forma atómica (research §3). */
export function submitCancellation(
  host: string | null,
  claimedSubdomain: string,
  token: string,
  now?: Date,
): Promise<CancelResult>;
```

## `src/lib/cancellation/actions.ts` ("use server")

```ts
/** Uso: useActionState(cancelAppointment.bind(null, subdomain, token), initialCancelState) */
export async function cancelAppointment(
  subdomain: string,
  token: string,
  _prev: CancelResult | null,
  _formData: FormData,
): Promise<CancelResult>;  // lee headers().get("host") y llama a submitCancellation
```

## Correo: `src/lib/email/`

```ts
// send.ts (server-only)
export type Email = { to: string; subject: string; html: string; text: string };
export function sendEmail(email: Email): Promise<void>; // research §5: outbox | resend

// confirmation.ts (server-only)
export type ConfirmationData = {
  to: string;
  barbershopName: string;
  summary: BookingSummary;   // de src/lib/booking/booking-state.ts
  cancelUrl: string;
};
export function confirmationEmail(data: ConfirmationData): Omit<Email, "to">;
export function sendConfirmation(data: ConfirmationData): Promise<void>; // nunca lanza: registra { code, message }

// escape.ts (sin server-only)
export function escapeHtml(value: string): string;
```

## Cambios en la reserva (`src/lib/booking/`)

- **`book.ts`**: `bookAppointment` genera el token y guarda `cancel_token_hash: hashToken(token)` en el insert.
  - Devuelve el tipo interno `BookingOutcome = { result: BookingResult; confirmation?: ConfirmationData }`.
  - El token solo viaja dentro de `confirmation.cancelUrl`.
- **`submit.ts`**: `submitBooking` devuelve `BookingOutcome`.
  - Honeypot: `{ result: { ok: true, summary: null } }` sin `confirmation`.
- **`actions.ts`**: `createBooking` hace `if (outcome.confirmation) after(() => sendConfirmation(outcome.confirmation!))` y devuelve **solo** `outcome.result`.

## Mensajes (`src/lib/cancellation/messages.ts`, sin server-only)

```ts
export const CANCEL_MESSAGES = {
  invalid: "Este enlace no es válido.",
  alreadyCancelled: "Esta cita ya está cancelada.",
  past: "Esta cita ya pasó y no se puede cancelar.",
  cancelled: "Tu cita fue cancelada. El horario quedó libre.",
  serverError: "No se pudo cancelar la cita. Inténtalo de nuevo.",
} as const;
```

## Página (frontend)

`src/app/s/[subdomain]/cancelar/[token]/page.tsx` (Server Component) + `src/components/cancellation/cancel-form.tsx` ("use client", `useActionState`, `<form method="post">`).

| `CancellationView.status` | Muestra |
|---|---|
| `active` | Título "Cancelar cita", resumen (servicio, barbero, fecha y hora, duración, precio) y botón destructivo "Cancelar cita" |
| `already_cancelled` | `alreadyCancelled` + resumen + enlace "Reservar otra cita" (`/reservar`) |
| `past` | `past` + resumen |
| `invalid` | `invalid` + enlace "Ir a la barbería" (`/`) |

Tras `ok: true`: `cancelled` con `role="status"` + enlace "Reservar otra cita". Con un error: el mensaje en `role="alert"`.
