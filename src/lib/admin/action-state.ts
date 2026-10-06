// Resultado de las server actions del panel (src/lib/admin/actions.ts).
// Va en archivo aparte porque un módulo "use server" solo puede exportar funciones async.

export type ActionState = {
  ok: boolean;
  message?: string; // éxito o error general
  fieldErrors?: Record<string, string[]>; // errores por campo, para aria-describedby
};

export const initialState: ActionState = { ok: false };
