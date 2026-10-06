// Número de contacto → formato internacional E.164 (spec 002, FR-010; research §5).
// Sin dependencias: pensado para Colombia (+57). Si llegan barberías de otros países,
// `libphonenumber-js` está anotado en el Roadmap.

const E164 = /^\+[1-9][0-9]{7,14}$/; // misma regla que appointments.customer_phone

/** Devuelve el número en E.164 o null si no es válido. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-.()]/g, "");
  let candidate: string;

  if (compact.startsWith("+")) candidate = compact;
  else if (/^3\d{9}$/.test(compact)) candidate = `+57${compact}`; // celular colombiano de 10 dígitos
  else if (/^57\d{10}$/.test(compact)) candidate = `+${compact}`; // con 57 pero sin "+"
  else return null;

  return E164.test(candidate) ? candidate : null;
}
