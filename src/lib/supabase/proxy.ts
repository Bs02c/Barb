import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refresca la sesión de Supabase antes de que se renderice la página y escribe
 * las cookies nuevas en la respuesta. Los tokens de refresco son de un solo uso,
 * por eso se hace una vez por navegación aquí y no en cada componente.
 *
 * `makeResponse` crea la respuesta (rewrite o next) con la petición ya actualizada.
 */
export async function refreshSession(
  request: NextRequest,
  makeResponse: () => NextResponse,
): Promise<NextResponse> {
  let response = makeResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = makeResponse();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Valida el token y lo renueva si caducó.
  await supabase.auth.getClaims();
  return response;
}
