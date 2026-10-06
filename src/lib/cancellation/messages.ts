// Textos de la cancelación que se muestran en más de un sitio (contracts/cancellation.md).

export const CANCEL_MESSAGES = {
  invalid: "Este enlace no es válido.",
  alreadyCancelled: "Esta cita ya está cancelada.",
  past: "Esta cita ya pasó y no se puede cancelar.",
  cancelled: "Tu cita fue cancelada. El horario quedó libre.",
  serverError: "No se pudo cancelar la cita. Inténtalo de nuevo.",
} as const;
