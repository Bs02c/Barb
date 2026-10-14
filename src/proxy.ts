import { NextResponse, type NextRequest } from "next/server";
import { proxyAction, ROOT_DOMAIN } from "@/lib/tenant";

// Next.js 16 llama "proxy" a lo que antes era middleware.
// Traduce el subdominio a una ruta interna: labarberia.midominio.com/x → /s/labarberia/x.
// Aquí no se consulta la base de datos ni la sesión (el proxy no es para cargar datos): la página de
// /s/[subdomain] comprueba si la barbería existe y está activa, y el panel verifica la sesión contra
// la base en cada petición (spec 005, FR-018).
// /api/auth/* (Better Auth) pasa sin reescribir, pero solo desde el subdominio de una barbería: la
// cookie de sesión es de ese subdominio (spec 005, research §6).

// Ruta inexistente: Next.js responde con la página 404 y estado 404.
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/404", request.url));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const action = proxyAction(request.headers.get("host"), pathname, ROOT_DOMAIN);

  switch (action.kind) {
    case "rewrite":
      return NextResponse.rewrite(new URL(`${action.path}${search}`, request.url));
    case "next":
      return NextResponse.next();
    case "not-found":
      return notFound(request);
  }
}

export const config = {
  // Todo menos archivos estáticos, optimización de imágenes y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
