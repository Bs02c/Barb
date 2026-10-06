import { NextResponse, type NextRequest } from "next/server";
import { resolveTenant } from "@/lib/tenant";

// Next.js 16 llama "proxy" a lo que antes era middleware.
// Traduce el subdominio a una ruta interna: labarberia.midominio.com/x → /s/labarberia/x.
// Aquí no se consulta la base de datos (el proxy no es para cargar datos):
// la página de /s/[subdomain] comprueba si la barbería existe y está activa.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const TENANT_PREFIX = "/s";

// Ruta inexistente: Next.js responde con la página 404 y estado 404.
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/404", request.url));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const tenant = resolveTenant(request.headers.get("host"), ROOT_DOMAIN);

  if (tenant.kind === "tenant") {
    const target = new URL(`${TENANT_PREFIX}/${tenant.subdomain}${pathname}${search}`, request.url);
    return NextResponse.rewrite(target);
  }

  // Las rutas internas /s/... solo se alcanzan a través de un subdominio.
  if (tenant.kind === "root" && pathname !== TENANT_PREFIX && !pathname.startsWith(`${TENANT_PREFIX}/`)) {
    return NextResponse.next();
  }

  return notFound(request);
}

export const config = {
  // Todo menos archivos estáticos, optimización de imágenes y archivos con extensión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
