import { z } from "zod";

// Token del enlace de cancelación (spec 003, research §1): 32 bytes aleatorios en base64url.
// Compartido por la página y la server action: formato inválido = "enlace no válido" sin consultar.
export const cancelTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
